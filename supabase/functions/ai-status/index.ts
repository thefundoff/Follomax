// Admin-only Folly AI (Claude) health endpoint for the web dashboard.
//
// By default it returns the health recorded passively by the bot's real traffic
// (app_settings.ai_last_ok / ai_last_error) — a cheap DB read that costs no AI usage,
// so the dashboard can poll it. Pass { live: true } to actively ping the Anthropic
// Messages API once (the "Test now" button); a live 429 is parsed for its retry-after
// header and recorded.

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

    const apiKey = await getSetting(admin, 'anthropic_api_key')
    const model = (await getSetting(admin, 'anthropic_model')) || 'claude-opus-4-8'
    const configured = !!apiKey && !apiKey.startsWith('REPLACE_')

    const lastOk = await getJsonSetting(admin, 'ai_last_ok')
    let lastError = await getJsonSetting(admin, 'ai_last_error')

    if (!live) {
      return json({ provider: 'anthropic', configured, model, live: false, last_ok: lastOk, last_error: lastError }, 200)
    }

    if (!configured) {
      return json({ provider: 'anthropic', configured: false, model, live: true, status: 0, ok: false, message: 'No Anthropic API key set', last_ok: lastOk, last_error: lastError }, 200)
    }

    const started = Date.now()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
    })
    const latencyMs = Date.now() - started

    let retryAfterSeconds: number | null = null
    if (res.status === 429) {
      const ra = res.headers.get('retry-after')
      retryAfterSeconds = ra ? parseInt(ra, 10) || null : null
      const evt = { status: 429, at: new Date().toISOString() }
      await admin.from('app_settings').upsert({ key: 'ai_last_error', value: evt }, { onConflict: 'key' })
      lastError = evt
    } else if (res.ok) {
      const evt = { at: new Date().toISOString() }
      await admin.from('app_settings').upsert({ key: 'ai_last_ok', value: evt }, { onConflict: 'key' })
    }

    return json({
      provider: 'anthropic',
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
