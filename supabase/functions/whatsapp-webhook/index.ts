// Folly on WhatsApp — official Meta Cloud API webhook. Mirrors the Telegram bot but
// renders via WhatsApp interactive messages (reply buttons / list messages). Reuses
// the channel-agnostic brain: _shared/folly-core (menus, keywords, ordering flow),
// _shared/folly-agent (Gemini + tools), and _shared/folly-onboarding (account auth).
//
// Identity: the WhatsApp id IS the sender's phone number (wa_id). A user who verified
// their phone on Telegram is auto-recognized here by that number — one account, both
// channels.
//
// Security: GET verifies Meta's hub.verify_token; POST verifies the X-Hub-Signature-256
// HMAC against app_settings.whatsapp_app_secret. Set "Verify JWT" OFF for this function.

import { getAdminClient, getSetting } from '../_shared/supabase-admin.ts'
import { placeOrderCore } from '../_shared/order-core.ts'
import {
  type Reply,
  type Intent,
  type OrderFlow,
  matchKeyword,
  isCommandLike,
  resolveTarget,
  mainMenuReply,
  helpReply,
  addFundsReply,
  balanceReply,
  ordersReply,
  categoriesReply,
  categoryServicesReply,
  serviceDetailReply,
} from '../_shared/folly-core.ts'
import { type ToolCtx, type PendingOrder, runAgent, recordAiEvent } from '../_shared/folly-agent.ts'
import { EMAIL_RE, LOCK_MINUTES, welcomeText, bindChannel, createPasswordlessAccount, verifyLogin } from '../_shared/folly-onboarding.ts'

type AdminClient = ReturnType<typeof getAdminClient>

const GRAPH = 'https://graph.facebook.com/v21.0'

// ---------------------------------------------------------------------------
// WhatsApp Cloud API senders
// ---------------------------------------------------------------------------
async function wa(token: string, phoneId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  return res.json()
}

function sendText(token: string, phoneId: string, to: string, body: string) {
  return wa(token, phoneId, { to, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } })
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Render a channel-agnostic Reply as a WhatsApp message: url buttons → links in the
// body; ≤3 action buttons → reply buttons; more → a list message (up to 10 rows).
function renderReply(token: string, phoneId: string, to: string, reply: Reply) {
  const flat = (reply.buttons ?? []).flat()
  const urlBtns = flat.filter((b) => b.url)
  const actionBtns = flat.filter((b) => !b.url)

  let body = reply.text
  for (const u of urlBtns) body += `\n\n${u.title}: ${u.url}`
  body = body.slice(0, 1000)

  if (actionBtns.length === 0) return sendText(token, phoneId, to, body)

  if (actionBtns.length <= 3) {
    return wa(token, phoneId, {
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: actionBtns.map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: trunc(b.title, 20) } })) },
      },
    })
  }

  const rows = actionBtns.slice(0, 10).map((b) => ({ id: b.id.slice(0, 200), title: trunc(b.title, 24) }))
  return wa(token, phoneId, {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: { button: 'Select', sections: [{ rows }] },
    },
  })
}

const confirmButtons = (token: string, phoneId: string, to: string, text: string) =>
  wa(token, phoneId, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: text.slice(0, 1000) },
      action: { buttons: [
        { type: 'reply', reply: { id: 'confirm_order', title: '✅ Confirm' } },
        { type: 'reply', reply: { id: 'cancel_order', title: '❌ Cancel' } },
      ] },
    },
  })

const onboardButtons = (token: string, phoneId: string, to: string) =>
  wa(token, phoneId, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: "👋 Welcome to Follomax! I'm Folly, your assistant for buying likes, followers, views and more.\n\nAre you new here, or do you already have a Follomax account?" },
      action: { buttons: [
        { type: 'reply', reply: { id: 'auth_new', title: '🆕 Create account' } },
        { type: 'reply', reply: { id: 'auth_existing', title: '🔑 I have an account' } },
      ] },
    },
  })

// ---------------------------------------------------------------------------
// Session state (per WhatsApp user)
// ---------------------------------------------------------------------------
interface AuthState { step?: 'awaiting_email' | 'awaiting_password'; email?: string }
interface SessionState {
  history?: { role: 'user' | 'model'; text: string }[]
  pending?: PendingOrder | null
  auth?: AuthState | null
  flow?: OrderFlow | null
}

async function getSession(admin: AdminClient, waId: string): Promise<SessionState> {
  const { data } = await admin.from('whatsapp_sessions').select('state').eq('wa_id', waId).single()
  return (data?.state as SessionState) || {}
}
async function saveSession(admin: AdminClient, waId: string, state: SessionState) {
  await admin.from('whatsapp_sessions').upsert({ wa_id: waId, state }, { onConflict: 'wa_id' })
}

async function resolveProfile(admin: AdminClient, waId: string) {
  const byId = await admin.from('profiles').select('id, full_name').eq('whatsapp_id', waId).single()
  if (byId.data) return byId.data
  // Auto-link by a phone number verified on another channel (e.g. Telegram).
  const byPhone = await admin.from('profiles').select('id, full_name').in('phone_number', [waId, `+${waId}`]).is('whatsapp_id', null).single()
  if (byPhone.data) {
    await bindChannel(admin, 'whatsapp_id', waId, byPhone.data.id)
    return byPhone.data
  }
  return null
}

async function linkWhatsapp(admin: AdminClient, userId: string, waId: string) {
  await bindChannel(admin, 'whatsapp_id', waId, userId)
  await admin.from('profiles').update({ phone_number: waId }).eq('id', userId).is('phone_number', null)
}

// ---------------------------------------------------------------------------
// Deterministic intents (shared with menu buttons + keywords)
// ---------------------------------------------------------------------------
async function handleIntent(admin: AdminClient, token: string, phoneId: string, to: string, userId: string, intent: Intent, currency: string, webAppUrl: string) {
  let reply: Reply
  switch (intent) {
    case 'balance': reply = await balanceReply(admin, userId, currency); break
    case 'orders': reply = await ordersReply(admin, userId, currency); break
    case 'services': reply = await categoriesReply(admin); break
    case 'addfunds': reply = addFundsReply(webAppUrl); break
    case 'help': reply = helpReply(); break
    default: reply = mainMenuReply(); break
  }
  await renderReply(token, phoneId, to, reply)
}

// ---------------------------------------------------------------------------
// Signature verification (X-Hub-Signature-256)
// ---------------------------------------------------------------------------
async function verifySignature(appSecret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!appSecret || appSecret.startsWith('REPLACE_')) return true // not configured yet
  if (!header || !header.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
  return header.slice(7) === hex
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const admin = getAdminClient()

  // ---- Meta webhook verification handshake (GET) ----
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const verifyToken = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expected = await getSetting(admin, 'whatsapp_verify_token')
    if (mode === 'subscribe' && verifyToken && verifyToken === expected) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  const rawBody = await req.text()
  const appSecret = await getSetting(admin, 'whatsapp_app_secret')
  if (!(await verifySignature(appSecret, rawBody, req.headers.get('X-Hub-Signature-256')))) {
    return new Response('unauthorized', { status: 401 })
  }

  let update: Record<string, unknown>
  try { update = JSON.parse(rawBody) } catch { return new Response('ok', { status: 200 }) }

  const token = await getSetting(admin, 'whatsapp_access_token')
  const phoneId = await getSetting(admin, 'whatsapp_phone_number_id')
  const currency = (await getSetting(admin, 'currency')) || 'NGN'
  const model = (await getSetting(admin, 'gemini_model')) || 'gemini-flash-latest'
  const rawKey = await getSetting(admin, 'gemini_api_key')
  const geminiKey = rawKey && !rawKey.startsWith('REPLACE_') ? rawKey : ''
  const webAppUrl = (await getSetting(admin, 'web_app_url')) || ''

  try {
    // ---- Parse the inbound message ----
    const value = ((update.entry as Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>)?.[0]?.changes?.[0]?.value) as Record<string, unknown> | undefined
    const msg = (value?.messages as Array<Record<string, unknown>>)?.[0]
    if (!msg) return new Response('ok', { status: 200 }) // status callbacks etc.

    const from = String(msg.from ?? '')
    if (!from) return new Response('ok', { status: 200 })
    const profileName = (value?.contacts as Array<{ profile?: { name?: string } }>)?.[0]?.profile?.name

    let text = ''
    let callbackId = ''
    if (msg.type === 'text') {
      text = String((msg.text as { body?: string })?.body ?? '').trim()
    } else if (msg.type === 'interactive') {
      const inter = msg.interactive as { button_reply?: { id: string }; list_reply?: { id: string } }
      callbackId = inter?.button_reply?.id ?? inter?.list_reply?.id ?? ''
    } else {
      await sendText(token, phoneId, from, 'Please send a text message or use the buttons. 🙂')
      return new Response('ok', { status: 200 })
    }

    const session = await getSession(admin, from)
    const profile = await resolveProfile(admin, from)

    // ==================== BUTTON / LIST REPLIES ====================
    if (callbackId) {
      // ---- Onboarding choices ----
      if (callbackId === 'auth_new' || callbackId === 'auth_existing') {
        if (profile) {
          await renderReply(token, phoneId, from, mainMenuReply("You're already connected 🙂 What would you like to do?"))
          return new Response('ok', { status: 200 })
        }
        if (callbackId === 'auth_existing') {
          session.auth = { step: 'awaiting_email' }
          await saveSession(admin, from, session)
          await sendText(token, phoneId, from, "Let's connect your existing account. What's the email you registered on Follomax?")
          return new Response('ok', { status: 200 })
        }
        // auth_new — passwordless account; phone is already verified (it's their WhatsApp number).
        const email = `wa${from}@folly.follomax.app`
        const result = await createPasswordlessAccount(admin, email, profileName || 'WhatsApp User', null)
        if (!result.ok) {
          await sendText(token, phoneId, from, result.reason === 'exists'
            ? 'Looks like you already have an account. Send "menu" and choose “🔑 I have an account” to connect it.'
            : '😕 Sorry, I could not create your account just now. Please try again in a moment.')
          return new Response('ok', { status: 200 })
        }
        await linkWhatsapp(admin, result.userId, from)
        session.auth = null
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, welcomeText(profileName?.split(' ')[0]))
        await renderReply(token, phoneId, from, mainMenuReply())
        return new Response('ok', { status: 200 })
      }

      // ---- Everything below needs a linked account ----
      if (!profile) {
        await onboardButtons(token, phoneId, from)
        return new Response('ok', { status: 200 })
      }

      if (callbackId.startsWith('menu_')) {
        const intent: Intent = callbackId === 'menu_help' ? 'help'
          : callbackId === 'menu_balance' ? 'balance'
          : callbackId === 'menu_orders' ? 'orders'
          : callbackId === 'menu_services' ? 'services'
          : callbackId === 'menu_addfunds' ? 'addfunds'
          : 'menu'
        await handleIntent(admin, token, phoneId, from, profile.id, intent, currency, webAppUrl)
        return new Response('ok', { status: 200 })
      }
      if (callbackId.startsWith('catpage_')) {
        const [, cid, pg] = callbackId.split('_')
        await renderReply(token, phoneId, from, await categoryServicesReply(admin, parseInt(cid, 10), parseInt(pg, 10), currency))
        return new Response('ok', { status: 200 })
      }
      if (callbackId.startsWith('cat_')) {
        await renderReply(token, phoneId, from, await categoryServicesReply(admin, parseInt(callbackId.slice(4), 10), 0, currency))
        return new Response('ok', { status: 200 })
      }
      if (callbackId.startsWith('svc_')) {
        const detail = await serviceDetailReply(admin, parseInt(callbackId.slice(4), 10), currency)
        if (!detail) {
          await sendText(token, phoneId, from, 'That service is no longer available.')
          return new Response('ok', { status: 200 })
        }
        session.flow = detail.flow
        await saveSession(admin, from, session)
        await renderReply(token, phoneId, from, detail.reply)
        return new Response('ok', { status: 200 })
      }
      if (callbackId === 'flow_cancel') {
        session.flow = null
        await saveSession(admin, from, session)
        await renderReply(token, phoneId, from, mainMenuReply('Cancelled. What next?'))
        return new Response('ok', { status: 200 })
      }
      if (callbackId === 'cancel_order') {
        session.pending = null
        await saveSession(admin, from, session)
        await renderReply(token, phoneId, from, mainMenuReply('No problem — cancelled. Anything else? 👍'))
        return new Response('ok', { status: 200 })
      }
      if (callbackId === 'confirm_order') {
        if (!session.pending) {
          await sendText(token, phoneId, from, "That order isn't available anymore. Send \"menu\" to start again.")
          return new Response('ok', { status: 200 })
        }
        const p = session.pending
        const result = await placeOrderCore(admin, profile.id, { service_id: p.service_id, link: p.link, quantity: p.quantity })
        session.pending = null
        await saveSession(admin, from, session)
        if (result.success) {
          const { data: fresh } = await admin.from('profiles').select('balance').eq('id', profile.id).single()
          await sendText(token, phoneId, from, `✅ Order placed! ${p.quantity.toLocaleString()} × ${p.service_name}\nOrder #${result.order_id.slice(0, 8)} — now processing.\nNew balance: ${fresh?.balance?.toFixed(2)} ${currency}`)
        } else if (result.code === 'insufficient_balance') {
          await sendText(token, phoneId, from, `⚠️ Not enough balance for that order. Top up here: ${webAppUrl.replace(/\/$/, '')}/funds`)
        } else {
          await sendText(token, phoneId, from, `⚠️ Sorry, I couldn't place that order: ${result.error}. You have not been charged.`)
        }
        return new Response('ok', { status: 200 })
      }
      return new Response('ok', { status: 200 })
    }

    // ==================== TEXT MESSAGES ====================
    // ---- Not linked: onboarding / login state machine ----
    if (!profile) {
      const step = session.auth?.step
      if (step === 'awaiting_email') {
        if (!EMAIL_RE.test(text)) {
          await sendText(token, phoneId, from, "That doesn't look like a valid email. Please send the email you used on Follomax.")
          return new Response('ok', { status: 200 })
        }
        session.auth = { step: 'awaiting_password', email: text.toLowerCase() }
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, '🔒 Now send your password. (You can delete your message afterwards — it stays private.)')
        return new Response('ok', { status: 200 })
      }
      if (step === 'awaiting_password') {
        const email = session.auth?.email || ''
        const result = await verifyLogin(admin, email, text)
        if (!result.ok) {
          if (result.locked) {
            session.auth = null
            await saveSession(admin, from, session)
            await sendText(token, phoneId, from, `⛔ Too many attempts. Please try again in ${LOCK_MINUTES} minutes (send "menu" to restart).`)
          } else {
            await sendText(token, phoneId, from, '❌ Incorrect password. Please try again, or send "menu" to go back.')
          }
          return new Response('ok', { status: 200 })
        }
        await linkWhatsapp(admin, result.userId, from)
        const { data: p } = await admin.from('profiles').select('full_name').eq('id', result.userId).single()
        session.auth = null
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, `✅ Connected${p?.full_name ? ', ' + p.full_name.split(' ')[0] : ''}!`)
        await renderReply(token, phoneId, from, mainMenuReply())
        return new Response('ok', { status: 200 })
      }
      await onboardButtons(token, phoneId, from)
      return new Response('ok', { status: 200 })
    }

    // ---- Linked: guided ordering flow (deterministic) ----
    const flowExitIntents = new Set<Intent>(['menu', 'cancel', 'balance', 'orders', 'addfunds', 'help'])

    if (session.flow?.step === 'await_link') {
      const f = session.flow
      const kw = matchKeyword(text)
      if (kw && flowExitIntents.has(kw) && isCommandLike(text) && !/^https?:/i.test(text)) {
        session.flow = null
        await saveSession(admin, from, session)
        if (kw === 'menu' || kw === 'cancel') await renderReply(token, phoneId, from, mainMenuReply('No problem — cancelled. What next?'))
        else await handleIntent(admin, token, phoneId, from, profile.id, kw, currency, webAppUrl)
        return new Response('ok', { status: 200 })
      }
      const target = resolveTarget(text)
      if (target) {
        f.link = target
        f.step = 'await_qty'
        f.attempts = 0
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, `Got it 👍 Target: ${target}\n\nHow many? Enter a whole number between ${f.min} and ${f.max}.`)
        return new Response('ok', { status: 200 })
      }
      f.attempts = (f.attempts ?? 0) + 1
      if (f.attempts >= 3) {
        session.flow = null
        await saveSession(admin, from, session)
        await renderReply(token, phoneId, from, mainMenuReply("Let's start over — pick a service from the menu when you're ready. 🙂"))
        return new Response('ok', { status: 200 })
      }
      await saveSession(admin, from, session)
      await sendText(token, phoneId, from, `That doesn't look like a link or username. Please paste the post link (e.g. https://instagram.com/p/…) or the @username for "${f.service_name}". Send "cancel" to stop.`)
      return new Response('ok', { status: 200 })
    }
    if (session.flow?.step === 'await_qty') {
      const f = session.flow
      const kwq = matchKeyword(text)
      if (kwq && flowExitIntents.has(kwq) && isCommandLike(text)) {
        session.flow = null
        await saveSession(admin, from, session)
        if (kwq === 'menu' || kwq === 'cancel') await renderReply(token, phoneId, from, mainMenuReply('No problem — cancelled. What next?'))
        else await handleIntent(admin, token, phoneId, from, profile.id, kwq, currency, webAppUrl)
        return new Response('ok', { status: 200 })
      }
      const qty = /^[\d,_\s]+$/.test(text) ? parseInt(text.replace(/[,_\s]/g, ''), 10) : NaN
      if (!Number.isInteger(qty) || qty < f.min || qty > f.max) {
        f.attempts = (f.attempts ?? 0) + 1
        if (f.attempts >= 3) {
          session.flow = null
          await saveSession(admin, from, session)
          await renderReply(token, phoneId, from, mainMenuReply("Let's start over when you're ready — pick a service from the menu. 🙂"))
          return new Response('ok', { status: 200 })
        }
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, `Please enter just a whole number between ${f.min} and ${f.max} (e.g. ${f.min}).`)
        return new Response('ok', { status: 200 })
      }
      const charge = (qty / 1000) * f.rate
      const { data: prof } = await admin.from('profiles').select('balance').eq('id', profile.id).single()
      const balance = prof?.balance ?? 0
      if (balance < charge) {
        session.flow = null
        await saveSession(admin, from, session)
        await sendText(token, phoneId, from, `⚠️ That order costs ${charge.toFixed(2)} ${currency}, but your balance is ${balance.toFixed(2)} ${currency}.`)
        await renderReply(token, phoneId, from, addFundsReply(webAppUrl))
        return new Response('ok', { status: 200 })
      }
      session.pending = { service_id: f.service_id, service_name: f.service_name, link: f.link!, quantity: qty, charge }
      session.flow = null
      await saveSession(admin, from, session)
      await confirmButtons(token, phoneId, from, `🧾 Order summary:\n${qty.toLocaleString()} × ${f.service_name}\nLink: ${f.link}\nCharge: ${charge.toFixed(2)} ${currency}\n\nConfirm?`)
      return new Response('ok', { status: 200 })
    }

    // ---- Linked free-text ----
    if (!text) {
      await renderReply(token, phoneId, from, mainMenuReply('I can help you order likes, followers, views and more. 🙂'))
      return new Response('ok', { status: 200 })
    }

    const kw = matchKeyword(text)
    if (kw === 'cancel') {
      session.pending = null
      session.flow = null
      await saveSession(admin, from, session)
      await renderReply(token, phoneId, from, mainMenuReply('Okay, cancelled. What next?'))
      return new Response('ok', { status: 200 })
    }
    const aiFreeIntents = new Set<Intent>(['menu', 'balance', 'orders', 'addfunds', 'help'])
    if (kw && isCommandLike(text) && aiFreeIntents.has(kw)) {
      await handleIntent(admin, token, phoneId, from, profile.id, kw, currency, webAppUrl)
      return new Response('ok', { status: 200 })
    }

    // Richer natural language → Claude/Gemini agent, with graceful fallback.
    if (geminiKey) {
      try {
        const ctx: ToolCtx = { admin, userId: profile.id, currency, webAppUrl, session, pendingStaged: false }
        const reply = await runAgent(ctx, geminiKey, model, text)
        await recordAiEvent(admin, true)
        const history = (session.history ?? []).concat({ role: 'user', text }, { role: 'model', text: reply }).slice(-16)
        await saveSession(admin, from, { ...session, history, pending: session.pending ?? null, auth: null })
        if (session.pending) await confirmButtons(token, phoneId, from, reply)
        else await sendText(token, phoneId, from, reply)
        return new Response('ok', { status: 200 })
      } catch (e) {
        console.error('agent unavailable, using fallback:', e)
        const m = String(e).match(/gemini_(\d+)/)
        await recordAiEvent(admin, false, m ? parseInt(m[1], 10) : 0)
      }
    }

    if (kw) {
      await handleIntent(admin, token, phoneId, from, profile.id, kw, currency, webAppUrl)
      return new Response('ok', { status: 200 })
    }
    await renderReply(token, phoneId, from, mainMenuReply('I can help with that from the menu — tap a button, or try “balance”, “orders” or “services”:'))
    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('whatsapp-webhook error:', err)
    return new Response('ok', { status: 200 }) // never 500 → Meta would retry-storm
  }
})
