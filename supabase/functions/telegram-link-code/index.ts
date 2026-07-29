// Generates a one-time code so a signed-in web user can connect their Telegram
// account, and handles disconnecting. Called from the Profile page with the user's
// JWT. The actual linking happens in `telegram-webhook` when the user opens the
// resulting t.me deep link.

import { corsHeaders } from '../_shared/cors.ts'
import { getAdminClient, getSetting, getUserFromJWT } from '../_shared/supabase-admin.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Unambiguous alphabet (no 0/O/1/I) for a short, human-safe code.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function makeCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

const CODE_TTL_MINUTES = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const admin = getAdminClient()
    const userId = await getUserFromJWT(admin, req.headers.get('Authorization'))
    if (!userId) return json({ error: 'Unauthorized' }, 401)

    const { action = 'create' } = await req.json().catch(() => ({}))

    if (action === 'disconnect') {
      await admin.from('profiles').update({ telegram_user_id: null }).eq('id', userId)
      return json({ success: true }, 200)
    }

    // action === 'create'
    const code = makeCode()
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()

    const { error } = await admin.from('telegram_link_codes').insert({
      code,
      user_id: userId,
      expires_at: expiresAt,
    })
    if (error) throw error

    const botUsername = (await getSetting(admin, 'telegram_bot_username')).replace(/^@/, '')
    const deepLink = `https://t.me/${botUsername}?start=${code}`

    return json({ code, deep_link: deepLink, bot_username: botUsername, expires_at: expiresAt }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
