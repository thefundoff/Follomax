// Folly in the web app — an authenticated in-app chat. The caller is already logged
// in (Supabase JWT), so there's no onboarding: we resolve the user from the token and
// run the same shared agent as the Telegram/WhatsApp bots. Orders are staged by the
// agent and confirmed by a second call (action: "place"), which re-validates through
// placeOrderCore, so a tampered client can't change the price or bypass the balance check.

import { corsHeaders } from '../_shared/cors.ts'
import { getAdminClient, getSetting, getUserFromJWT } from '../_shared/supabase-admin.ts'
import { runAgent, type ToolCtx } from '../_shared/folly-agent.ts'
import { parseOrderIntent } from '../_shared/folly-core.ts'
import { placeOrderCore } from '../_shared/order-core.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const admin = getAdminClient()
    const userId = await getUserFromJWT(admin, req.headers.get('Authorization'))
    if (!userId) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'message'
    const currency = (await getSetting(admin, 'currency')) || 'NGN'

    // ---- Confirm a staged order (re-validated server-side) ----
    if (action === 'place') {
      const service_id = body.service_id
      const link = String(body.link ?? '')
      const quantity = parseInt(String(body.quantity), 10)
      const result = await placeOrderCore(admin, userId, { service_id, link, quantity })
      if (!result.success) return json({ ok: false, error: result.error, code: result.code }, 200)
      const { data: prof } = await admin.from('profiles').select('balance').eq('id', userId).single()
      return json({ ok: true, order_id: result.order_id, balance: prof?.balance ?? 0, currency }, 200)
    }

    // ---- Chat message ----
    const message = String(body.message ?? '').trim()
    if (!message) return json({ reply: 'Hi! Ask me anything about your orders or services 🙂', pending: null }, 200)

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-12)
      .map((h: { role?: string; text?: string }) => ({ role: h.role === 'model' ? 'model' as const : 'user' as const, text: String(h.text ?? '') }))
      .filter((h: { text: string }) => h.text)

    const model = (await getSetting(admin, 'gemini_model')) || 'gemini-flash-latest'
    const rawKey = await getSetting(admin, 'gemini_api_key')
    const geminiKey = rawKey && !rawKey.startsWith('REPLACE_') ? rawKey : ''
    const webAppUrl = (await getSetting(admin, 'web_app_url')) || ''

    const session: { history: typeof history; pending: unknown } = { history, pending: null }
    const ctx: ToolCtx = { admin, userId, currency, webAppUrl, session, pendingStaged: false }

    if (geminiKey) {
      try {
        const reply = await runAgent(ctx, geminiKey, model, message)
        return json({ reply, pending: session.pending ?? null, currency }, 200)
      } catch (e) {
        console.error('folly-chat agent error:', e)
      }
    }

    // AI-free fallback: surface matching services deterministically.
    const parsed = await parseOrderIntent(admin, message)
    if (parsed && parsed.services.length) {
      const list = parsed.services.map((s) => `• ${s.name} — ${s.rate.toFixed(2)} ${currency}/1k`).join('\n')
      return json({ reply: `Here are matching services:\n${list}\n\nTell me the target link and quantity and I'll set up the order.`, pending: null }, 200)
    }
    return json({ reply: "I'm having trouble reaching my AI right now — please try again in a moment, or browse services from the menu.", pending: null }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
