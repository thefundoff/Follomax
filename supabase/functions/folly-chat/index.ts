// Folly in the web app — authenticated in-app chat with buttons + guided ordering.
// Reuses the shared brain (folly-core replies, folly-agent AI, order-core). The caller
// is already logged in (Supabase JWT), so there's no onboarding. Flow/pending state is
// held by the client and echoed back each turn; confirming always re-validates through
// placeOrderCore, so a tampered client can't change the price or bypass the balance check.

import { corsHeaders } from '../_shared/cors.ts'
import { getAdminClient, getSetting, getUserFromJWT } from '../_shared/supabase-admin.ts'
import { runAgent, type ToolCtx } from '../_shared/folly-agent.ts'
import {
  type Reply,
  type Intent,
  type OrderFlow,
  type Btn,
  matchKeyword,
  resolveTarget,
  parseOrderIntent,
  servicePickerReply,
  mainMenuReply,
  helpReply,
  addFundsReply,
  balanceReply,
  ordersReply,
  categoriesReply,
  categoryServicesReply,
  serviceDetailReply,
} from '../_shared/folly-core.ts'
import { placeOrderCore } from '../_shared/order-core.ts'

interface PendingOrder { service_id: number; service_name: string; link: string; quantity: number; charge: number }

const CATS_PER_PAGE = 12
const confirmButtons: Btn[][] = [[{ id: 'confirm_order', title: '✅ Confirm' }, { id: 'cancel_order', title: '❌ Cancel' }]]
const cancelButtons: Btn[][] = [[{ id: 'flow_cancel', title: '❌ Cancel' }]]

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
    const currency = (await getSetting(admin, 'currency')) || 'NGN'
    const webAppUrl = (await getSetting(admin, 'web_app_url')) || ''

    let flow: OrderFlow | null = body.flow ?? null
    let pending: PendingOrder | null = body.pending ?? null

    // Uniform response: text + optional buttons + the (possibly updated) flow/pending state.
    const out = (reply: Reply | string, buttons?: Btn[][] | null, extra: Record<string, unknown> = {}) => {
      const r = typeof reply === 'string' ? { text: reply } : reply
      return json({ reply: r.text, buttons: buttons ?? r.buttons ?? null, flow, pending, currency, ...extra }, 200)
    }

    async function intentReply(intent: Intent): Promise<Reply> {
      switch (intent) {
        case 'balance': return await balanceReply(admin, userId!, currency)
        case 'orders': return await ordersReply(admin, userId!, currency)
        case 'services': return await categoriesReply(admin, 0, CATS_PER_PAGE)
        case 'addfunds': return addFundsReply(webAppUrl)
        case 'help': return helpReply()
        default: return mainMenuReply()
      }
    }

    async function confirmPending(): Promise<Response> {
      if (!pending) return out("That order isn't available anymore. What would you like to do?", mainMenuReply().buttons)
      const p = pending
      const result = await placeOrderCore(admin, userId!, { service_id: p.service_id, link: p.link, quantity: p.quantity })
      pending = null
      if (result.success) {
        const { data: fresh } = await admin.from('profiles').select('balance').eq('id', userId!).single()
        return out(`✅ Order placed! #${result.order_id.slice(0, 8)} — now processing.\nNew balance: ${fresh?.balance?.toFixed(2)} ${currency}`, mainMenuReply().buttons, { order_placed: true })
      }
      if (result.code === 'insufficient_balance') return out('⚠️ Your balance is too low for that order.', addFundsReply(webAppUrl).buttons)
      return out(`⚠️ Could not place that order: ${result.error}. You were not charged.`, mainMenuReply().buttons)
    }

    // ---- Stage an order from a known service + quantity ----
    async function stageOrder(f: OrderFlow, qty: number): Promise<Response> {
      const charge = (qty / 1000) * f.rate
      const { data: prof } = await admin.from('profiles').select('balance').eq('id', userId!).single()
      const balance = prof?.balance ?? 0
      if (balance < charge) {
        flow = null
        return out(`⚠️ That order costs ${charge.toFixed(2)} ${currency}, but your balance is ${balance.toFixed(2)} ${currency}.`, addFundsReply(webAppUrl).buttons)
      }
      pending = { service_id: f.service_id, service_name: f.service_name, link: f.link!, quantity: qty, charge }
      flow = null
      return out(`🧾 Order summary:\n${qty.toLocaleString()} × ${f.service_name}\nLink: ${f.link}\nCharge: ${charge.toFixed(2)} ${currency}\n\nConfirm?`, confirmButtons)
    }

    // ==================== BUTTON CLICK ====================
    const buttonId = typeof body.button_id === 'string' ? body.button_id : ''
    if (buttonId) {
      if (buttonId.startsWith('menu_')) {
        flow = null
        const intent: Intent = buttonId === 'menu_help' ? 'help' : buttonId === 'menu_balance' ? 'balance' : buttonId === 'menu_orders' ? 'orders' : buttonId === 'menu_services' ? 'services' : buttonId === 'menu_addfunds' ? 'addfunds' : 'menu'
        return out(await intentReply(intent))
      }
      if (buttonId.startsWith('catspage_')) return out(await categoriesReply(admin, parseInt(buttonId.slice(9), 10), CATS_PER_PAGE))
      if (buttonId.startsWith('catpage_')) { const [, cid, pg] = buttonId.split('_'); return out(await categoryServicesReply(admin, parseInt(cid, 10), parseInt(pg, 10), currency)) }
      if (buttonId.startsWith('cat_')) return out(await categoryServicesReply(admin, parseInt(buttonId.slice(4), 10), 0, currency))
      if (buttonId.startsWith('svc_')) {
        const detail = await serviceDetailReply(admin, parseInt(buttonId.slice(4), 10), currency)
        if (!detail) return out('That service is no longer available.', mainMenuReply().buttons)
        flow = detail.flow
        return out(detail.reply, cancelButtons)
      }
      if (buttonId === 'flow_cancel') { flow = null; return out(mainMenuReply('No problem — cancelled. What next?')) }
      if (buttonId === 'cancel_order') { pending = null; return out(mainMenuReply('Cancelled. Anything else?')) }
      if (buttonId === 'confirm_order') return await confirmPending()
      return out(mainMenuReply())
    }

    // ==================== TEXT MESSAGE ====================
    const message = String(body.message ?? '').trim()
    if (!message) return out('Hi! Tap an option below or just tell me what you need 🙂', mainMenuReply().buttons)

    // ---- Guided flow steps ----
    if (flow?.step === 'await_link') {
      if (/^(cancel|stop|menu)$/i.test(message)) { flow = null; return out(mainMenuReply('Cancelled. What next?')) }
      const target = resolveTarget(message)
      if (target) {
        flow.link = target
        flow.attempts = 0
        if (flow.quantity != null) return await stageOrder(flow, flow.quantity)
        flow.step = 'await_qty'
        return out(`Got it 👍 Target: ${target}\n\nHow many? Enter a whole number between ${flow.min} and ${flow.max}.`, cancelButtons)
      }
      flow.attempts = (flow.attempts ?? 0) + 1
      if (flow.attempts >= 3) { flow = null; return out(mainMenuReply("Let's start over — pick a service from the menu. 🙂")) }
      return out(`That doesn't look like a link or username. Please paste the post link (e.g. https://instagram.com/p/…) or the @username for "${flow.service_name}".`, cancelButtons)
    }
    if (flow?.step === 'await_qty') {
      if (/^(cancel|stop|menu)$/i.test(message)) { flow = null; return out(mainMenuReply('Cancelled. What next?')) }
      const qty = /^[\d,_\s]+$/.test(message) ? parseInt(message.replace(/[,_\s]/g, ''), 10) : NaN
      if (!Number.isInteger(qty) || qty < flow.min || qty > flow.max) {
        return out(`Please enter just a whole number between ${flow.min} and ${flow.max}.`, cancelButtons)
      }
      return await stageOrder(flow, qty)
    }

    // ---- Free text → AI, with parser fallback ----
    const model = (await getSetting(admin, 'gemini_model')) || 'gemini-flash-latest'
    const rawKey = await getSetting(admin, 'gemini_api_key')
    const geminiKey = rawKey && !rawKey.startsWith('REPLACE_') ? rawKey : ''

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-12)
      .map((h: { role?: string; text?: string }) => ({ role: h.role === 'model' ? 'model' as const : 'user' as const, text: String(h.text ?? '') }))
      .filter((h: { text: string }) => h.text)

    if (geminiKey) {
      try {
        const session: { history: typeof history; pending: unknown } = { history, pending: null }
        const ctx: ToolCtx = { admin, userId, currency, webAppUrl, session, pendingStaged: false }
        const reply = await runAgent(ctx, geminiKey, model, message)
        if (session.pending) { pending = session.pending as PendingOrder; return out(reply, confirmButtons) }
        return out(reply, null)
      } catch (e) {
        console.error('folly-chat agent error:', e)
      }
    }

    // AI unavailable → deterministic order parser or keyword intent.
    const parsed = await parseOrderIntent(admin, message)
    if (parsed && parsed.services.length) {
      if (parsed.services.length === 1) {
        const s = parsed.services[0]
        const qty = parsed.quantity != null && parsed.quantity >= s.min && parsed.quantity <= s.max ? parsed.quantity : undefined
        flow = { step: 'await_link', service_id: s.service_id, service_name: s.name, rate: s.rate, min: s.min, max: s.max, quantity: qty, attempts: 0 }
        const note = qty ? ` (qty: ${qty.toLocaleString()})` : ''
        return out(`✅ Found it: ${s.name}${note}\n\n🔗 Send the post link or @username to order.`, cancelButtons)
      }
      return out(servicePickerReply(parsed.services))
    }
    const kw = matchKeyword(message)
    if (kw) return out(await intentReply(kw))
    return out("I'm having trouble reaching my AI right now — tap an option below to keep going.", mainMenuReply().buttons)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
