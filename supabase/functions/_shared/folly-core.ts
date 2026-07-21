// Channel-agnostic "brain" for Folly that works WITHOUT the AI: keyword recognition,
// menus, and the data for every core action. Returns neutral { text, buttons } replies
// so any channel (Telegram now, WhatsApp later) can render them — Telegram maps buttons
// to inline keyboards, WhatsApp to interactive reply buttons/lists. This is the
// deterministic fallback used whenever Gemini is exhausted, unset, or failing.

import { getAdminClient } from './supabase-admin.ts'

type AdminClient = ReturnType<typeof getAdminClient>

export interface Btn { id: string; title: string; url?: string }
export interface Reply { text: string; buttons?: Btn[][] }

const SERVICES_PER_PAGE = 8

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
function money(n: number): string {
  return Number(n).toFixed(2)
}

// ---------------------------------------------------------------------------
// Keyword recognition (no AI). Returns a core intent or null.
// ---------------------------------------------------------------------------
export type Intent = 'menu' | 'balance' | 'orders' | 'services' | 'addfunds' | 'help' | 'cancel'

export function matchKeyword(raw: string): Intent | null {
  let t = raw.trim().toLowerCase()
  if (t.startsWith('/')) t = t.slice(1).trim()

  if (/^(menu|main menu|main|home|start|hi|hello|hey|yo)$/.test(t)) return 'menu'
  if (/^(cancel|stop|exit|quit)$/.test(t)) return 'cancel'
  if (/(^|\s)help($|\s)|^\?$|what can you do/.test(t)) return 'help'
  if (/balance|wallet|how much.*(have|money|left)|my money|^bal$/.test(t)) return 'balance'
  if (/(add|top).{0,4}(fund|money|up|cash|credit)|deposit|topup|recharge|fund (my|account)/.test(t)) return 'addfunds'
  if (/\border status\b|\bmy orders?\b|order history|track order|status of|^status$|^orders?$/.test(t)) return 'orders'
  if (/service|price|catalog|buy|purchase|\border\b|followers?|likes?|views?|subscriber|comments?|shares?|members?/.test(t)) return 'services'
  if (/orders?/.test(t)) return 'orders'
  return null
}

// A message is "command-like" (safe to handle without AI, pre-empting Gemini) when
// it's a slash command or a short phrase.
export function isCommandLike(raw: string): boolean {
  const t = raw.trim()
  return t.startsWith('/') || t.split(/\s+/).length <= 4
}

// ---------------------------------------------------------------------------
// Static replies
// ---------------------------------------------------------------------------
export function mainMenuReply(text = 'What would you like to do? 👇'): Reply {
  return {
    text,
    buttons: [
      [{ id: 'menu_balance', title: '💰 Balance' }, { id: 'menu_orders', title: '📦 My Orders' }],
      [{ id: 'menu_services', title: '🔍 Order Services' }, { id: 'menu_addfunds', title: '➕ Add Funds' }],
      [{ id: 'menu_help', title: '❓ Help' }],
    ],
  }
}

export function helpReply(): Reply {
  return {
    text: [
      "🤖 I'm Folly, your Follomax assistant. You can chat naturally, tap buttons, or use these commands:",
      '',
      '• /menu — main menu',
      '• /balance — your wallet balance',
      '• /orders — your recent orders',
      '• /services — browse & order',
      '• /addfunds — top up your wallet',
      '',
      'To order you can also just say e.g. "1000 Instagram followers".',
    ].join('\n'),
    buttons: mainMenuReply().buttons,
  }
}

export function addFundsReply(webAppUrl: string): Reply {
  const url = `${webAppUrl.replace(/\/$/, '')}/funds`
  return {
    text: '➕ Top up your wallet securely on the Follomax web app:',
    buttons: [[{ id: 'open_addfunds', title: '➕ Add Funds', url }], [{ id: 'menu_main', title: '⬅ Menu' }]],
  }
}

// ---------------------------------------------------------------------------
// Data-backed replies
// ---------------------------------------------------------------------------
export async function balanceReply(admin: AdminClient, userId: string, currency: string): Promise<Reply> {
  const { data } = await admin.from('profiles').select('balance').eq('id', userId).single()
  return {
    text: `💰 Your wallet balance: ${money(data?.balance ?? 0)} ${currency}`,
    buttons: [[{ id: 'menu_services', title: '🔍 Order' }, { id: 'menu_addfunds', title: '➕ Add Funds' }], [{ id: 'menu_main', title: '⬅ Menu' }]],
  }
}

export async function ordersReply(admin: AdminClient, userId: string, currency: string): Promise<Reply> {
  const { data } = await admin
    .from('orders')
    .select('id, quantity, charge, status, remains, created_at, services(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  const rows = data ?? []
  if (rows.length === 0) {
    return { text: "You have no orders yet. Tap 🔍 Order Services to place your first one!", buttons: [[{ id: 'menu_services', title: '🔍 Order Services' }], [{ id: 'menu_main', title: '⬅ Menu' }]] }
  }

  const lines = rows.map((o: Record<string, unknown>) => {
    const name = (o.services as { name: string } | null)?.name ?? 'Order'
    return `#${String(o.id).slice(0, 8)} • ${trunc(name, 28)}\n   ${o.quantity} • ${String(o.status).replace('_', ' ')} • ${money(o.charge as number)} ${currency}`
  })
  return {
    text: '📦 Your recent orders:\n\n' + lines.join('\n\n'),
    buttons: [[{ id: 'menu_orders', title: '🔄 Refresh' }, { id: 'menu_services', title: '🔍 New Order' }], [{ id: 'menu_main', title: '⬅ Menu' }]],
  }
}

export async function categoriesReply(admin: AdminClient): Promise<Reply> {
  const { data } = await admin
    .from('categories')
    .select('id, name, icon')
    .eq('is_active', true)
    .order('sort_order')

  const cats = data ?? []
  if (cats.length === 0) return { text: 'No service categories are available right now.', buttons: [[{ id: 'menu_main', title: '⬅ Menu' }]] }

  const btns: Btn[] = cats.map((c: Record<string, unknown>) => ({
    id: `cat_${c.id}`,
    title: trunc(`${c.icon ? c.icon + ' ' : ''}${c.name}`, 30),
  }))
  // 2 per row
  const rows: Btn[][] = []
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2))
  rows.push([{ id: 'menu_main', title: '⬅ Menu' }])

  return { text: '🔍 Choose a platform:', buttons: rows }
}

export async function categoryServicesReply(admin: AdminClient, catId: number, page: number, currency: string): Promise<Reply> {
  const { data: cat } = await admin.from('categories').select('name').eq('id', catId).single()
  const { data, count } = await admin
    .from('services')
    .select('id, name, rate', { count: 'exact' })
    .eq('category_id', catId)
    .eq('is_active', true)
    .order('name')
    .range(page * SERVICES_PER_PAGE, page * SERVICES_PER_PAGE + SERVICES_PER_PAGE - 1)

  const services = data ?? []
  const total = count ?? services.length
  const pages = Math.max(1, Math.ceil(total / SERVICES_PER_PAGE))

  if (services.length === 0) {
    return { text: `No services under ${cat?.name ?? 'this platform'} yet.`, buttons: [[{ id: 'menu_services', title: '⬅ Platforms' }]] }
  }

  const rows: Btn[][] = services.map((s: Record<string, unknown>) => [{
    id: `svc_${s.id}`,
    title: trunc(`${s.name} — ${money(s.rate as number)}/1k`, 60),
  }])

  const nav: Btn[] = []
  if (page > 0) nav.push({ id: `catpage_${catId}_${page - 1}`, title: '◀ Prev' })
  if (page < pages - 1) nav.push({ id: `catpage_${catId}_${page + 1}`, title: 'Next ▶' })
  if (nav.length) rows.push(nav)
  rows.push([{ id: 'menu_services', title: '⬅ Platforms' }])

  return { text: `📋 ${cat?.name ?? 'Services'} (page ${page + 1}/${pages}) — tap one to order:`, buttons: rows }
}

export interface OrderFlow {
  step: 'await_link' | 'await_qty'
  service_id: number
  service_name: string
  rate: number
  min: number
  max: number
  link?: string
}

// Returns the service detail prompt and the flow to store, or null if not found.
export async function serviceDetailReply(admin: AdminClient, serviceId: number, currency: string): Promise<{ reply: Reply; flow: OrderFlow } | null> {
  const { data: s } = await admin
    .from('services')
    .select('id, name, rate, min_quantity, max_quantity')
    .eq('id', serviceId)
    .eq('is_active', true)
    .single()

  if (!s) return null

  const reply: Reply = {
    text: `✅ ${s.name}\nPrice: ${money(s.rate)} ${currency} per 1000\nMin: ${s.min_quantity} • Max: ${s.max_quantity}\n\n🔗 Send the link or @username for this order.`,
    buttons: [[{ id: 'flow_cancel', title: '❌ Cancel' }]],
  }
  const flow: OrderFlow = {
    step: 'await_link',
    service_id: s.id,
    service_name: s.name,
    rate: s.rate,
    min: s.min_quantity,
    max: s.max_quantity,
  }
  return { reply, flow }
}
