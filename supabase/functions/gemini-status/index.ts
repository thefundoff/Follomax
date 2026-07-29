// Admin-only Gemini (Folly AI) health endpoint for the web dashboard.
//
// By default it returns the health recorded passively by the bot's real traffic
// (app_settings.gemini_last_ok / gemini_last_error) — a cheap DB read that costs no
// Gemini quota, so the dashboard can poll it. Pass { live: true } to actively ping
// Gemini once (used by the "Test now" button); a live 429 is parsed for its retry
// delay and recorded.

import { corsHeaders } from '../_shared/cors.ts'
import { getAdminClient, getSetting, getUserFromJWT } from '../_shared/supabase-admin.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type AdminClient = ReturnType<typeof getAdminClient>

async function getJsonSetting(admin: AdminClient, key: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).single()
  const v = data?.value
  if (!v) return null
  if (typeof v === 'object') return v as Record<string, unknown>
  try { return JSON.parse(String(v)) } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const admin = getAdminClient()
    const userId = await getUserFromJWT(admin, req.headers.get('Authorization'))
    if (!userId) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single()
    if (profile?.role !== 'admin') return json({ error: 'Forbidden' }, 403)

    const { live = false } = await req.json().catch(() => ({}))

    const apiKey = await getSetting(admin, 'gemini_api_key')
    const model = (await getSetting(admin, 'gemini_model')) || 'gemini-flash-latest'
    const configured = !!apiKey && !apiKey.startsWith('REPLACE_')

    const lastOk = await getJsonSetting(admin, 'gemini_last_ok')
    let lastError = await getJsonSetting(admin, 'gemini_last_error')

    // Passive (cheap) response — derives status from recorded bot traffic.
    if (!live) {
      return json({ configured, model, live: false, last_ok: lastOk, last_error: lastError }, 200)
    }

    // Live ping (costs one Gemini request).
    if (!configured) {
      return json({ configured: false, model, live: true, status: 0, ok: false, message: 'No Gemini API key set', last_ok: lastOk, last_error: lastError }, 200)
    }

    const started = Date.now()
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
      },
    )
    const latencyMs = Date.now() - started
    const bodyText = await res.text()

    let retryAfterSeconds: number | null = null
    if (res.status === 429) {
      try {
        const j = JSON.parse(bodyText)
        const details = (j?.error?.details ?? []) as Array<Record<string, unknown>>
        const retry = details.find((d) => String(d['@type'] ?? '').includes('RetryInfo'))
        if (retry?.retryDelay) retryAfterSeconds = parseInt(String(retry.retryDelay).replace('s', ''), 10) || null
      } catch { /* ignore */ }
      const evt = { status: 429, at: new Date().toISOString() }
      await admin.from('app_settings').upsert({ key: 'gemini_last_error', value: evt }, { onConflict: 'key' })
      lastError = evt
    } else if (res.ok) {
      const evt = { at: new Date().toISOString() }
      await admin.from('app_settings').upsert({ key: 'gemini_last_ok', value: evt }, { onConflict: 'key' })
    }

    return json({
      configured: true,
      model,
      live: true,
      ok: res.ok,
      status: res.status,
      latency_ms: latencyMs,
      retry_after_seconds: retryAfterSeconds,
      last_ok: res.ok ? { at: new Date().toISOString() } : lastOk,
      last_error: lastError,
    }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
