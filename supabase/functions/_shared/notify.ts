// Channel-agnostic order-status alerts. When an order reaches a terminal state, this
// notifies the user on every channel they're linked to: Telegram (push), WhatsApp
// (best-effort — free-form only works inside the 24h window; outside it needs an
// approved template), and the web app (a notifications row Folly surfaces in-app).

import { getAdminClient, getSetting } from './supabase-admin.ts'

type AdminClient = ReturnType<typeof getAdminClient>

export const NOTIFY_STATES = new Set(['completed', 'partial', 'cancelled', 'error'])

function messageFor(status: string, shortId: string, service: string, quantity: number, remains: number | null): { title: string; body: string } {
  const name = service || 'your order'
  switch (status) {
    case 'completed':
      return { title: 'Order completed ✅', body: `Your order #${shortId} — ${quantity.toLocaleString()} × ${name} — is complete! 🎉` }
    case 'partial':
      return { title: 'Order partially delivered ⚠️', body: `Order #${shortId} (${name}) was partially delivered${remains ? `; ${remains.toLocaleString()} undelivered were refunded to your wallet` : ''}.` }
    case 'cancelled':
      return { title: 'Order cancelled ❌', body: `Order #${shortId} (${name}) was cancelled and you've been refunded.` }
    case 'error':
      return { title: 'Order failed ❌', body: `Order #${shortId} (${name}) failed and was fully refunded.` }
    default:
      return { title: 'Order update', body: `Order #${shortId} is now ${status.replace('_', ' ')}.` }
  }
}

export async function notifyOrderStatus(admin: AdminClient, orderId: string, newStatus: string) {
  if (!NOTIFY_STATES.has(newStatus)) return

  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, quantity, remains, services(name)')
    .eq('id', orderId)
    .single()
  if (!order) return

  const { data: profile } = await admin
    .from('profiles')
    .select('telegram_user_id, whatsapp_id')
    .eq('id', order.user_id)
    .single()

  const serviceName = (order.services as { name: string } | null)?.name ?? ''
  const shortId = String(order.id).slice(0, 8)
  const { title, body } = messageFor(newStatus, shortId, serviceName, order.quantity, order.remains)
  const text = `${title}\n${body}`

  // Web (in-app) — always record it.
  try {
    await admin.from('notifications').insert({ user_id: order.user_id, title, body, order_id: order.id, type: 'order' })
  } catch { /* ignore */ }

  // Telegram push
  if (profile?.telegram_user_id) {
    const tgToken = await getSetting(admin, 'telegram_bot_token')
    if (tgToken && !tgToken.startsWith('REPLACE_')) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: profile.telegram_user_id, text }),
        })
      } catch { /* ignore */ }
    }
  }

  // WhatsApp push (best-effort — succeeds within the 24h service window)
  if (profile?.whatsapp_id) {
    const waToken = await getSetting(admin, 'whatsapp_access_token')
    const waPhone = await getSetting(admin, 'whatsapp_phone_number_id')
    if (waToken && waPhone && !waToken.startsWith('REPLACE_') && !waPhone.startsWith('REPLACE_')) {
      try {
        await fetch(`https://graph.facebook.com/v21.0/${waPhone}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: profile.whatsapp_id, type: 'text', text: { body: text } }),
        })
      } catch { /* ignore */ }
    }
  }
}
