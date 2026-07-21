// Channel-agnostic AI agent for Folly: the Gemini function-calling loop plus the
// tool implementations (search_services, get_balance, place_order, get_order_status,
// add_funds_link). Operates purely on (admin, userId, session) so any channel —
// Telegram, WhatsApp — can drive it. The channel adapter renders the returned text
// and attaches its own Confirm/Cancel buttons when `pendingStaged` is set.

import { getAdminClient } from './supabase-admin.ts'
import { resolveTarget } from './folly-core.ts'

type AdminClient = ReturnType<typeof getAdminClient>

export interface PendingOrder {
  service_id: number
  service_name: string
  link: string
  quantity: number
  charge: number
}

export interface AgentSession {
  history?: { role: 'user' | 'model'; text: string }[]
  pending?: PendingOrder | null
}

export interface ToolCtx {
  admin: AdminClient
  userId: string
  currency: string
  webAppUrl: string
  session: AgentSession
  pendingStaged: boolean
}

// Record AI health from real traffic so the admin dashboard can show status without
// spending quota itself. Best-effort; never breaks the reply. (Same keys the Telegram
// bot uses, so the dashboard reflects both channels.)
export async function recordAiEvent(admin: AdminClient, ok: boolean, status = 0) {
  try {
    if (ok) {
      await admin.from('app_settings').upsert({ key: 'gemini_last_ok', value: { at: new Date().toISOString() } }, { onConflict: 'key' })
    } else {
      await admin.from('app_settings').upsert({ key: 'gemini_last_error', value: { status, at: new Date().toISOString() } }, { onConflict: 'key' })
    }
  } catch { /* ignore */ }
}

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

async function callGemini(apiKey: string, model: string, systemInstruction: string, contents: GeminiContent[]): Promise<GeminiPart[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemInstruction }] }, contents, tools: TOOLS }),
    },
  )
  if (!res.ok) throw new Error(`gemini_${res.status}`)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts ?? []
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

    if (!serviceId || !link || !Number.isInteger(quantity)) return { error: 'need service_id, link and quantity' }
    if (!resolveTarget(link)) return { error: 'invalid_link', message: 'That link/username looks invalid — ask the user for the post URL or @username, do not guess.' }

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
    if (balance < charge) return { error: 'insufficient_balance', balance, charge, currency }

    ctx.session.pending = { service_id: service.id, service_name: service.name, link, quantity, charge }
    ctx.pendingStaged = true

    return { status: 'awaiting_confirmation', service_name: service.name, quantity, charge, balance_after: balance - charge, currency }
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
    return { url: `${ctx.webAppUrl.replace(/\/$/, '')}/funds` }
  }

  return { error: 'unknown_tool' }
}

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
    `- If someone asks to add funds, direct them to ${webAppUrl.replace(/\/$/, '')}/funds.`,
  ].join('\n')
}

export async function runAgent(ctx: ToolCtx, apiKey: string, model: string, userText: string): Promise<string> {
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
