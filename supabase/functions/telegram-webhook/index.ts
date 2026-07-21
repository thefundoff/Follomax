// Folly — the Follomax Telegram assistant. Receives Telegram webhook updates,
// onboards/authenticates users entirely in-chat (no web app needed), then runs a
// Gemini (free-tier) function-calling agent so linked users can browse services,
// check balance/orders, and place orders. All money movement goes through the shared
// placeOrderCore, so a bot order behaves exactly like a web order.
//
// Identity model: Telegram cryptographically authenticates every update, so we trust
// message.from.id. New users get a passwordless Supabase account bound to their
// telegram_user_id; existing web users link by verifying their email + password.
// A verified phone number can be captured for future WhatsApp parity.
//
// Security: Telegram sends no Supabase JWT, so this function must have "Verify JWT"
// DISABLED in the dashboard. We verify Telegram's X-Telegram-Bot-Api-Secret-Token
// header against app_settings.telegram_webhook_secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAdminClient, getSetting } from '../_shared/supabase-admin.ts'
import { placeOrderCore } from '../_shared/order-core.ts'
import {
  type Reply,
  type Intent,
  type OrderFlow,
  matchKeyword,
  isCommandLike,
  mainMenuReply,
  helpReply,
  addFundsReply,
  balanceReply,
  ordersReply,
  categoriesReply,
  categoryServicesReply,
  serviceDetailReply,
} from '../_shared/folly-core.ts'

type AdminClient = ReturnType<typeof getAdminClient>

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------
async function tg(token: string, method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

const confirmKeyboard = {
  inline_keyboard: [[
    { text: '✅ Confirm', callback_data: 'confirm_order' },
    { text: '❌ Cancel', callback_data: 'cancel_order' },
  ]],
}

const onboardKeyboard = {
  inline_keyboard: [[
    { text: '🆕 Create account', callback_data: 'auth_new' },
    { text: '🔑 I have an account', callback_data: 'auth_existing' },
  ]],
}

const phoneKeyboard = {
  keyboard: [
    [{ text: '📱 Share phone number', request_contact: true }],
    [{ text: 'Skip' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
}

function sendMessage(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  return tg(token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

// Render a channel-agnostic Reply as a Telegram message with an inline keyboard.
// (A WhatsApp adapter would render the same Reply as interactive buttons/lists.)
function renderReply(token: string, chatId: number, reply: Reply) {
  const inline = reply.buttons?.map((row) =>
    row.map((b) => (b.url ? { text: b.title, url: b.url } : { text: b.title, callback_data: b.id })),
  )
  return sendMessage(token, chatId, reply.text, inline ? { inline_keyboard: inline } : undefined)
}

// ---------------------------------------------------------------------------
// Session state (per Telegram user)
// ---------------------------------------------------------------------------
interface PendingOrder {
  service_id: number
  service_name: string
  link: string
  quantity: number
  charge: number
}
interface AuthState {
  step?: 'awaiting_email' | 'awaiting_password' | 'awaiting_phone'
  email?: string
}
interface SessionState {
  history?: { role: 'user' | 'model'; text: string }[]
  pending?: PendingOrder | null
  auth?: AuthState | null
  pending_ref?: string | null
  flow?: OrderFlow | null
}

async function getSession(admin: AdminClient, tgId: number): Promise<SessionState> {
  const { data } = await admin.from('telegram_sessions').select('state').eq('telegram_user_id', tgId).single()
  return (data?.state as SessionState) || {}
}

async function saveSession(admin: AdminClient, tgId: number, state: SessionState) {
  await admin.from('telegram_sessions').upsert({ telegram_user_id: tgId, state }, { onConflict: 'telegram_user_id' })
}

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }

async function resolveProfile(admin: AdminClient, tgId: number) {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, phone_number')
    .eq('telegram_user_id', tgId)
    .single()
  return data
}

// ---------------------------------------------------------------------------
// Onboarding / auth
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LOGIN_ATTEMPTS = 3
const LOCK_MINUTES = 15

function randomPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!'
}

function welcomeText(firstName?: string): string {
  const name = firstName ? `, ${firstName}` : ''
  return `🎉 You're all set${name}! I'm Folly 🤖 — your Follomax assistant.\n\nTry:\n• "what Instagram followers do you have?"\n• "send 1000 likes to <link>"\n• "what's my balance?"\n• "status of my last order"`
}

async function startOnboarding(token: string, chatId: number) {
  await sendMessage(
    token,
    chatId,
    "👋 Welcome to Follomax! I'm Folly, your assistant for buying likes, followers, views and more.\n\nAre you new here, or do you already have a Follomax account?",
    onboardKeyboard,
  )
}

// Detach this Telegram id from any other profile (unique constraint), then bind it.
async function bindTelegram(admin: AdminClient, tgId: number, userId: string) {
  await admin.from('profiles').update({ telegram_user_id: null }).eq('telegram_user_id', tgId)
  await admin.from('profiles').update({ telegram_user_id: tgId }).eq('id', userId)
}

async function createPasswordlessAccount(
  admin: AdminClient,
  tgId: number,
  from: TgUser,
  ref: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; reason: 'exists' | 'error' }> {
  const email = `tg${tgId}@folly.follomax.app`
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram User'

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName, ...(ref ? { referral_code: ref } : {}) },
  })

  if (error || !data?.user) {
    const msg = (error?.message || '').toLowerCase()
    if (msg.includes('registered') || msg.includes('already') || msg.includes('exists')) {
      return { ok: false, reason: 'exists' }
    }
    console.error('createUser error:', error)
    return { ok: false, reason: 'error' }
  }

  await bindTelegram(admin, tgId, data.user.id)
  return { ok: true, userId: data.user.id }
}

// Verify an existing account's email + password (mirrors secure-login's lockout).
async function verifyLogin(
  admin: AdminClient,
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; locked: boolean; retryAfter?: number }> {
  const { data: lock } = await admin
    .from('login_lockouts')
    .select('failed_count, locked_until')
    .eq('email', email)
    .single()

  if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
    const retryAfter = Math.ceil((new Date(lock.locked_until).getTime() - Date.now()) / 1000)
    return { ok: false, locked: true, retryAfter }
  }

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password })

  if (error || !signIn?.user) {
    const nextCount = (lock?.failed_count ?? 0) + 1
    const locking = nextCount >= MAX_LOGIN_ATTEMPTS
    await admin.from('login_lockouts').upsert({
      email,
      failed_count: locking ? 0 : nextCount,
      locked_until: locking ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    return { ok: false, locked: locking, retryAfter: locking ? LOCK_MINUTES * 60 : undefined }
  }

  await admin.from('login_lockouts').delete().eq('email', email)
  return { ok: true, userId: signIn.user.id }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
interface FunctionCall { name: string; args: Record<string, unknown> }
interface GeminiPart { text?: string; functionCall?: FunctionCall; functionResponse?: unknown }
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

const TOOLS = [{
  function_declarations: [
    {
      name: 'search_services',
      description: 'Search the Follomax service catalog by keyword and/or platform. Returns real service ids, prices (rate per 1000) and min/max quantities. ALWAYS use this before quoting a price or placing an order — never invent services, ids or prices.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords, e.g. "instagram followers" or "tiktok views"' },
          platform: { type: 'string', description: 'Optional platform/category name to narrow results, e.g. "Instagram"' },
        },
      },
    },
    {
      name: 'get_balance',
      description: "Get the user's current wallet balance.",
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'place_order',
      description: 'Stage an order for the user to confirm. The user will receive Confirm/Cancel buttons automatically, so after calling this just tell them the price and ask them to confirm. Requires a service_id from search_services, the target link/username, and a quantity within the service min/max.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'integer', description: 'Internal service id from search_services' },
          link: { type: 'string', description: 'Target post URL or profile/username' },
          quantity: { type: 'integer', description: 'How many (must be within the service min/max)' },
        },
        required: ['service_id', 'link', 'quantity'],
      },
    },
    {
      name: 'get_order_status',
      description: "Look up the user's recent orders, or a specific order by its id/short id.",
      parameters: {
        type: 'object',
        properties: { order_id: { type: 'string', description: 'Optional order id or its first 8 characters' } },
      },
    },
    {
      name: 'add_funds_link',
      description: 'Get the link where the user can top up their wallet balance.',
      parameters: { type: 'object', properties: {} },
    },
  ],
}]

async function callGemini(
  apiKey: string,
  model: string,
  systemInstruction: string,
  contents: GeminiContent[],
): Promise<GeminiPart[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools: TOOLS,
      }),
    },
  )
  if (!res.ok) {
    // Quota exhausted (429), key invalid (400/403), server error (5xx), etc.
    throw new Error(`gemini_${res.status}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts ?? []
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
interface ToolCtx {
  admin: AdminClient
  userId: string
  currency: string
  webAppUrl: string
  session: SessionState
  pendingStaged: boolean
}

async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  const { admin, userId, currency } = ctx

  if (name === 'get_balance') {
    const { data } = await admin.from('profiles').select('balance').eq('id', userId).single()
    return { balance: data?.balance ?? 0, currency }
  }

  if (name === 'search_services') {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const platform = typeof args.platform === 'string' ? args.platform.trim() : ''

    let q = platform
      ? admin.from('services').select('id, name, type, rate, min_quantity, max_quantity, categories!inner(name)').eq('is_active', true).ilike('categories.name', `%${platform}%`)
      : admin.from('services').select('id, name, type, rate, min_quantity, max_quantity, categories(name)').eq('is_active', true)

    if (query) q = q.ilike('name', `%${query}%`)

    const { data } = await q.limit(20)
    const services = (data ?? []).map((s: Record<string, unknown>) => ({
      service_id: s.id,
      name: s.name,
      category: (s.categories as { name: string } | null)?.name ?? 'Other',
      rate_per_1000: Number(s.rate),
      min: s.min_quantity,
      max: s.max_quantity,
    }))
    return { count: services.length, services, currency }
  }

  if (name === 'place_order') {
    const serviceId = parseInt(String(args.service_id), 10)
    const link = String(args.link ?? '').trim()
    const quantity = parseInt(String(args.quantity), 10)

    if (!serviceId || !link || !Number.isInteger(quantity)) {
      return { error: 'need service_id, link and quantity' }
    }

    const { data: service } = await admin
      .from('services')
      .select('id, name, rate, min_quantity, max_quantity, is_active')
      .eq('id', serviceId)
      .eq('is_active', true)
      .single()

    if (!service) return { error: 'service_not_found' }

    if (quantity < service.min_quantity || quantity > service.max_quantity) {
      return { error: 'quantity_out_of_range', min: service.min_quantity, max: service.max_quantity }
    }

    const charge = (quantity / 1000) * service.rate
    const { data: profile } = await admin.from('profiles').select('balance').eq('id', userId).single()
    const balance = profile?.balance ?? 0

    if (balance < charge) {
      return { error: 'insufficient_balance', balance, charge, currency }
    }

    ctx.session.pending = { service_id: service.id, service_name: service.name, link, quantity, charge }
    ctx.pendingStaged = true

    return {
      status: 'awaiting_confirmation',
      service_name: service.name,
      quantity,
      charge,
      balance_after: balance - charge,
      currency,
    }
  }

  if (name === 'get_order_status') {
    const orderId = typeof args.order_id === 'string' ? args.order_id.trim() : ''
    let q = admin
      .from('orders')
      .select('id, quantity, charge, status, start_count, remains, created_at, services(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    q = orderId ? q.ilike('id', `${orderId}%`).limit(5) : q.limit(5)

    const { data } = await q
    const orders = (data ?? []).map((o: Record<string, unknown>) => ({
      order_id: String(o.id).slice(0, 8),
      service: (o.services as { name: string } | null)?.name ?? '',
      quantity: o.quantity,
      status: String(o.status).replace('_', ' '),
      remains: o.remains ?? o.quantity,
      charge: o.charge,
    }))
    return { count: orders.length, orders, currency }
  }

  if (name === 'add_funds_link') {
    return { url: `${ctx.webAppUrl.replace(/\/$/, '')}/add-funds` }
  }

  return { error: 'unknown_tool' }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------
function systemPrompt(currency: string, webAppUrl: string): string {
  return [
    'You are Folly, the friendly AI assistant for Follomax, a social media marketing (SMM) panel.',
    'Users chat with you to buy engagement — likes, followers, views, comments, etc. — for Instagram, TikTok, YouTube, Facebook, Twitter/X and more.',
    `The wallet currency is ${currency}. Prices are quoted as a rate per 1000 units; the charge for an order is (quantity / 1000) × rate.`,
    'Rules:',
    '- ALWAYS call search_services to find real services, ids and prices. Never invent a service, id or price.',
    '- To place an order you need three things: which service, the target link/username, and the quantity. Ask for whatever is missing.',
    '- When the user is ready, call place_order. This shows them Confirm/Cancel buttons, so after calling it just state the price clearly and ask them to confirm — do NOT claim the order is placed yet.',
    '- If their balance is too low, tell them and share the top-up link via add_funds_link.',
    '- Keep replies short, warm and easy to read. A few emojis are fine. Never expose internal ids unless asked.',
    `- If someone asks to add funds, direct them to ${webAppUrl.replace(/\/$/, '')}/add-funds.`,
  ].join('\n')
}

async function runAgent(ctx: ToolCtx, apiKey: string, model: string, userText: string): Promise<string> {
  const history = ctx.session.history ?? []
  const contents: GeminiContent[] = history.map((h) => ({ role: h.role, parts: [{ text: h.text }] }))
  contents.push({ role: 'user', parts: [{ text: userText }] })

  const sys = systemPrompt(ctx.currency, ctx.webAppUrl)

  for (let i = 0; i < 5; i++) {
    const parts = await callGemini(apiKey, model, sys, contents)
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!) as FunctionCall[]

    if (calls.length === 0) {
      const text = parts.map((p) => p.text).filter(Boolean).join('\n').trim()
      return text || "Sorry, I didn't quite get that. Could you rephrase?"
    }

    contents.push({ role: 'model', parts: calls.map((c) => ({ functionCall: c })) })
    const responseParts: GeminiPart[] = []
    for (const call of calls) {
      const result = await executeTool(call.name, call.args ?? {}, ctx)
      responseParts.push({ functionResponse: { name: call.name, response: result } })
    }
    contents.push({ role: 'user', parts: responseParts })
  }

  return 'That took a few too many steps — could you try asking again more directly?'
}

// ---------------------------------------------------------------------------
// /start (web deep-link code linking, kept for web users)
// ---------------------------------------------------------------------------
async function handleWebLinkCode(admin: AdminClient, token: string, chatId: number, tgId: number, code: string): Promise<boolean> {
  const { data: link } = await admin
    .from('telegram_link_codes')
    .select('user_id, used_at, expires_at')
    .eq('code', code.toUpperCase())
    .single()

  if (!link || link.used_at || new Date(link.expires_at) < new Date()) return false

  await bindTelegram(admin, tgId, link.user_id)
  await admin.from('telegram_link_codes').update({ used_at: new Date().toISOString() }).eq('code', code.toUpperCase())

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', link.user_id).single()
  await sendMessage(token, chatId, welcomeText(profile?.full_name?.split(' ')[0]))
  await renderReply(token, chatId, mainMenuReply())
  return true
}

// ---------------------------------------------------------------------------
// Deterministic intent handling (no AI) — shared by menu buttons and keywords
// ---------------------------------------------------------------------------
async function handleIntent(
  admin: AdminClient,
  token: string,
  chatId: number,
  userId: string,
  intent: Intent,
  currency: string,
  webAppUrl: string,
) {
  let reply: Reply
  switch (intent) {
    case 'balance': reply = await balanceReply(admin, userId, currency); break
    case 'orders': reply = await ordersReply(admin, userId, currency); break
    case 'services': reply = await categoriesReply(admin); break
    case 'addfunds': reply = addFundsReply(webAppUrl); break
    case 'help': reply = helpReply(); break
    default: reply = mainMenuReply(); break
  }
  await renderReply(token, chatId, reply)
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 })
  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  const admin = getAdminClient()

  const secret = await getSetting(admin, 'telegram_webhook_secret')
  if (secret && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return new Response('unauthorized', { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch {
    return new Response('ok', { status: 200 })
  }

  const token = await getSetting(admin, 'telegram_bot_token')
  const currency = (await getSetting(admin, 'currency')) || 'NGN'
  const model = (await getSetting(admin, 'gemini_model')) || 'gemini-2.5-flash'
  const geminiKey = await getSetting(admin, 'gemini_api_key')
  const webAppUrl = (await getSetting(admin, 'web_app_url')) || ''

  try {
    // ---- Callback queries -------------------------------------------------
    const callback = update.callback_query as Record<string, unknown> | undefined
    if (callback) {
      const cbId = String(callback.id)
      const from = callback.from as TgUser
      const message = callback.message as { chat: { id: number }; message_id: number }
      const chatId = message.chat.id
      const tgId = from.id
      const dataStr = String(callback.data ?? '')

      await tg(token, 'answerCallbackQuery', { callback_query_id: cbId })

      // ---- Onboarding choices ----
      if (dataStr === 'auth_new' || dataStr === 'auth_existing') {
        await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: message.message_id, reply_markup: { inline_keyboard: [] } })
        const session = await getSession(admin, tgId)

        if (await resolveProfile(admin, tgId)) {
          await sendMessage(token, chatId, "You're already connected 🙂 What would you like to order?")
          return new Response('ok', { status: 200 })
        }

        if (dataStr === 'auth_existing') {
          session.auth = { step: 'awaiting_email' }
          await saveSession(admin, tgId, session)
          await sendMessage(token, chatId, "Let's connect your existing account. What's the email you registered on Follomax?")
          return new Response('ok', { status: 200 })
        }

        // auth_new — create a passwordless account bound to this Telegram user.
        const result = await createPasswordlessAccount(admin, tgId, from, session.pending_ref ?? null)
        if (!result.ok) {
          if (result.reason === 'exists') {
            await sendMessage(token, chatId, "Looks like you already have an account. Tap /start and choose “🔑 I have an account” to connect it.")
          } else {
            await sendMessage(token, chatId, '😕 Sorry, I could not create your account just now. Please try again in a moment.')
          }
          return new Response('ok', { status: 200 })
        }

        session.auth = { step: 'awaiting_phone' }
        session.pending_ref = null
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, '✅ Account created! Optionally verify your phone number — it helps with support and future WhatsApp access.', phoneKeyboard)
        return new Response('ok', { status: 200 })
      }

      // ---- Everything below needs a linked account ----
      const profile = await resolveProfile(admin, tgId)
      if (!profile) {
        await sendMessage(token, chatId, "Let's get you set up first — tap /start.")
        return new Response('ok', { status: 200 })
      }
      const session = await getSession(admin, tgId)

      // ---- Menu & navigation (deterministic, no AI) ----
      if (dataStr.startsWith('menu_')) {
        const intent: Intent = dataStr === 'menu_help' ? 'help'
          : dataStr === 'menu_balance' ? 'balance'
          : dataStr === 'menu_orders' ? 'orders'
          : dataStr === 'menu_services' ? 'services'
          : dataStr === 'menu_addfunds' ? 'addfunds'
          : 'menu'
        await handleIntent(admin, token, chatId, profile.id, intent, currency, webAppUrl)
        return new Response('ok', { status: 200 })
      }
      if (dataStr.startsWith('catpage_')) {
        const [, cid, pg] = dataStr.split('_')
        await renderReply(token, chatId, await categoryServicesReply(admin, parseInt(cid, 10), parseInt(pg, 10), currency))
        return new Response('ok', { status: 200 })
      }
      if (dataStr.startsWith('cat_')) {
        await renderReply(token, chatId, await categoryServicesReply(admin, parseInt(dataStr.slice(4), 10), 0, currency))
        return new Response('ok', { status: 200 })
      }
      if (dataStr.startsWith('svc_')) {
        const detail = await serviceDetailReply(admin, parseInt(dataStr.slice(4), 10), currency)
        if (!detail) {
          await sendMessage(token, chatId, 'That service is no longer available.')
          return new Response('ok', { status: 200 })
        }
        session.flow = detail.flow
        await saveSession(admin, tgId, session)
        await renderReply(token, chatId, detail.reply)
        return new Response('ok', { status: 200 })
      }
      if (dataStr === 'flow_cancel') {
        session.flow = null
        await saveSession(admin, tgId, session)
        await renderReply(token, chatId, mainMenuReply('Cancelled. What next?'))
        return new Response('ok', { status: 200 })
      }

      // ---- Order confirm / cancel ----
      await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: message.message_id, reply_markup: { inline_keyboard: [] } })
      if (!session.pending) {
        await sendMessage(token, chatId, "That order isn't available anymore. Tap /menu to start again.")
        return new Response('ok', { status: 200 })
      }

      if (dataStr === 'cancel_order') {
        session.pending = null
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, 'No problem — cancelled. Anything else? 👍')
        return new Response('ok', { status: 200 })
      }

      if (dataStr === 'confirm_order') {
        const p = session.pending
        const result = await placeOrderCore(admin, profile.id, { service_id: p.service_id, link: p.link, quantity: p.quantity })
        session.pending = null
        await saveSession(admin, tgId, session)

        if (result.success) {
          const { data: fresh } = await admin.from('profiles').select('balance').eq('id', profile.id).single()
          await sendMessage(token, chatId, `✅ Order placed! ${p.quantity.toLocaleString()} × ${p.service_name}\nOrder #${result.order_id.slice(0, 8)} — now processing.\nNew balance: ${fresh?.balance?.toFixed(2)} ${currency}`)
        } else if (result.code === 'insufficient_balance') {
          await sendMessage(token, chatId, `⚠️ Not enough balance for that order. Top up here: ${webAppUrl.replace(/\/$/, '')}/add-funds`)
        } else {
          await sendMessage(token, chatId, `⚠️ Sorry, I couldn't place that order: ${result.error}. You have not been charged.`)
        }
        return new Response('ok', { status: 200 })
      }

      return new Response('ok', { status: 200 })
    }

    // ---- Regular message --------------------------------------------------
    const message = update.message as Record<string, unknown> | undefined
    const from = message?.from as TgUser | undefined
    const chat = message?.chat as { id: number } | undefined
    if (!message || !from || !chat) return new Response('ok', { status: 200 })

    const tgId = from.id
    const chatId = chat.id
    const text = typeof message.text === 'string' ? message.text.trim() : ''
    const contact = message.contact as { phone_number: string; user_id?: number } | undefined

    const session = await getSession(admin, tgId)
    const profile = await resolveProfile(admin, tgId)

    // ---- Shared contact (phone verification) ----
    if (contact) {
      if (contact.user_id && contact.user_id !== tgId) {
        await sendMessage(token, chatId, 'Please share your own contact using the button.', phoneKeyboard)
        return new Response('ok', { status: 200 })
      }
      const target = profile
      if (target) {
        await admin.from('profiles').update({ phone_number: contact.phone_number }).eq('id', target.id)
      }
      if (session.auth) { session.auth = null; await saveSession(admin, tgId, session) }
      await sendMessage(token, chatId, '📱 Number verified, thank you!', { remove_keyboard: true })
      await sendMessage(token, chatId, welcomeText(from.first_name))
      await renderReply(token, chatId, mainMenuReply())
      return new Response('ok', { status: 200 })
    }

    // ---- /start ----
    if (text.startsWith('/start')) {
      const param = text.split(/\s+/)[1] || null
      if (profile) {
        await sendMessage(token, chatId, `👋 Welcome back${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}!`)
        await renderReply(token, chatId, mainMenuReply())
        return new Response('ok', { status: 200 })
      }
      if (param) {
        if (param.toLowerCase().startsWith('ref_')) {
          session.pending_ref = param.slice(4)
          await saveSession(admin, tgId, session)
        } else if (await handleWebLinkCode(admin, token, chatId, tgId, param)) {
          return new Response('ok', { status: 200 })
        }
      }
      await startOnboarding(token, chatId)
      return new Response('ok', { status: 200 })
    }

    // ---- Not linked: drive the onboarding/login state machine ----
    if (!profile) {
      const step = session.auth?.step

      if (step === 'awaiting_email') {
        if (!EMAIL_RE.test(text)) {
          await sendMessage(token, chatId, "That doesn't look like a valid email. Please send the email you used on Follomax.")
          return new Response('ok', { status: 200 })
        }
        session.auth = { step: 'awaiting_password', email: text.toLowerCase() }
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, '🔒 Now send your password. (You can delete your message afterwards — it stays private.)')
        return new Response('ok', { status: 200 })
      }

      if (step === 'awaiting_password') {
        const email = session.auth?.email || ''
        const result = await verifyLogin(admin, email, text)
        if (!result.ok) {
          if (result.locked) {
            session.auth = null
            await saveSession(admin, tgId, session)
            await sendMessage(token, chatId, `⛔ Too many attempts. Please try again in ${LOCK_MINUTES} minutes (tap /start to restart).`)
          } else {
            await sendMessage(token, chatId, '❌ Incorrect password. Please try again, or tap /start to go back.')
          }
          return new Response('ok', { status: 200 })
        }
        await bindTelegram(admin, tgId, result.userId)
        const { data: p } = await admin.from('profiles').select('full_name').eq('id', result.userId).single()
        session.auth = { step: 'awaiting_phone' }
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, `✅ Connected${p?.full_name ? ', ' + p.full_name.split(' ')[0] : ''}! Optionally verify your phone number for support & future WhatsApp access.`, phoneKeyboard)
        return new Response('ok', { status: 200 })
      }

      // No active flow → show the onboarding choice.
      await startOnboarding(token, chatId)
      return new Response('ok', { status: 200 })
    }

    // ---- Linked, but still in the optional phone step ----
    if (session.auth?.step === 'awaiting_phone') {
      if (/^(skip|no|later|\/skip)$/i.test(text)) {
        session.auth = null
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, 'No problem, skipped. 👍', { remove_keyboard: true })
        await sendMessage(token, chatId, welcomeText(from.first_name))
        await renderReply(token, chatId, mainMenuReply())
        return new Response('ok', { status: 200 })
      }
      await sendMessage(token, chatId, 'Tap “📱 Share phone number”, or “Skip” to continue.', phoneKeyboard)
      return new Response('ok', { status: 200 })
    }

    // ---- Linked: guided ordering flow (deterministic, no AI) ----
    if (session.flow?.step === 'await_link') {
      if (/^(cancel|stop|menu)$/i.test(text)) {
        session.flow = null
        await saveSession(admin, tgId, session)
        await renderReply(token, chatId, mainMenuReply('Cancelled. What next?'))
        return new Response('ok', { status: 200 })
      }
      if (!text) {
        await sendMessage(token, chatId, 'Please send the link or @username for this order.')
        return new Response('ok', { status: 200 })
      }
      session.flow.link = text
      session.flow.step = 'await_qty'
      await saveSession(admin, tgId, session)
      await sendMessage(token, chatId, `How many? Enter a whole number between ${session.flow.min} and ${session.flow.max}.`, { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'flow_cancel' }]] })
      return new Response('ok', { status: 200 })
    }
    if (session.flow?.step === 'await_qty') {
      const f = session.flow
      if (/^(cancel|stop|menu)$/i.test(text)) {
        session.flow = null
        await saveSession(admin, tgId, session)
        await renderReply(token, chatId, mainMenuReply('Cancelled. What next?'))
        return new Response('ok', { status: 200 })
      }
      const qty = parseInt(text.replace(/[,_\s]/g, ''), 10)
      if (!Number.isInteger(qty) || qty < f.min || qty > f.max) {
        await sendMessage(token, chatId, `Please enter a whole number between ${f.min} and ${f.max}.`, { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'flow_cancel' }]] })
        return new Response('ok', { status: 200 })
      }
      const charge = (qty / 1000) * f.rate
      const { data: prof } = await admin.from('profiles').select('balance').eq('id', profile.id).single()
      const balance = prof?.balance ?? 0
      if (balance < charge) {
        session.flow = null
        await saveSession(admin, tgId, session)
        await sendMessage(token, chatId, `⚠️ That order costs ${charge.toFixed(2)} ${currency}, but your balance is ${balance.toFixed(2)} ${currency}.`)
        await renderReply(token, chatId, addFundsReply(webAppUrl))
        return new Response('ok', { status: 200 })
      }
      session.pending = { service_id: f.service_id, service_name: f.service_name, link: f.link!, quantity: qty, charge }
      session.flow = null
      await saveSession(admin, tgId, session)
      await sendMessage(token, chatId, `🧾 Order summary:\n${qty.toLocaleString()} × ${f.service_name}\nLink: ${f.link}\nCharge: ${charge.toFixed(2)} ${currency}\n\nConfirm?`, confirmKeyboard)
      return new Response('ok', { status: 200 })
    }

    // ---- Linked free-text ----
    if (!text) {
      await renderReply(token, chatId, mainMenuReply('I can help you order likes, followers, views and more. 🙂'))
      return new Response('ok', { status: 200 })
    }

    // Fast, AI-free path for commands & simple keywords (saves Gemini quota).
    const kw = matchKeyword(text)
    if (kw === 'cancel') {
      session.pending = null
      session.flow = null
      await saveSession(admin, tgId, session)
      await renderReply(token, chatId, mainMenuReply('Okay, cancelled. What next?'))
      return new Response('ok', { status: 200 })
    }
    // Slash commands are always deterministic; simple info keywords too. Order-ish
    // phrases (kw === 'services') are left for Gemini when it's available (nicer
    // one-shot ordering), and only fall back to the guided menu if Gemini is down.
    const aiFreeIntents = new Set<Intent>(['menu', 'balance', 'orders', 'addfunds', 'help'])
    if (kw && (text.startsWith('/') || (isCommandLike(text) && aiFreeIntents.has(kw)))) {
      await handleIntent(admin, token, chatId, profile.id, kw, currency, webAppUrl)
      return new Response('ok', { status: 200 })
    }

    // Richer natural language → Gemini, with graceful fallback if it's down/exhausted.
    if (geminiKey) {
      try {
        await tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
        const ctx: ToolCtx = { admin, userId: profile.id, currency, webAppUrl, session, pendingStaged: false }
        const reply = await runAgent(ctx, geminiKey, model, text)
        const history = (session.history ?? []).concat(
          { role: 'user', text },
          { role: 'model', text: reply },
        ).slice(-16)
        await saveSession(admin, tgId, { ...session, history, pending: session.pending ?? null, auth: null })
        await sendMessage(token, chatId, reply, ctx.pendingStaged ? confirmKeyboard : undefined)
        return new Response('ok', { status: 200 })
      } catch (e) {
        console.error('gemini unavailable, using fallback:', e)
      }
    }

    // Fallback (AI unavailable): best-effort keyword match, otherwise the menu.
    if (kw) {
      await handleIntent(admin, token, chatId, profile.id, kw, currency, webAppUrl)
      return new Response('ok', { status: 200 })
    }
    await renderReply(token, chatId, mainMenuReply('I can help with that from the menu — tap a button, or try “balance”, “orders” or “services”:'))
    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('telegram-webhook error:', err)
    try {
      const chatId = ((update.message as { chat?: { id: number } })?.chat
        ?? (update.callback_query as { message?: { chat?: { id: number } } })?.message?.chat)?.id
      if (chatId) await sendMessage(token, chatId, '😕 Something went wrong on my end. Please try again in a moment.')
    } catch { /* ignore */ }
    return new Response('ok', { status: 200 })
  }
})
