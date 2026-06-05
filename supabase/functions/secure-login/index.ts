// Server-side login proxy that enforces a 3-strikes / 15-minute lockout without
// needing the paid "Password Verification" auth hook. The browser calls this
// instead of supabase.auth.signInWithPassword directly; on success it returns
// the session tokens, which the client installs via supabase.auth.setSession.
//
// Because the attempt counter lives in the DB (service-role only), it can't be
// reset by clearing localStorage or using incognito.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS = 3
const LOCK_MINUTES = 15

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const { email: rawEmail, password } = await req.json()
    if (!rawEmail || !password) return json({ error: 'Missing email or password' }, 400)

    const email = String(rawEmail).trim().toLowerCase()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // 1. Is this account currently locked?
    const { data: lock } = await admin
      .from('login_lockouts')
      .select('failed_count, locked_until')
      .eq('email', email)
      .single()

    if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(lock.locked_until).getTime() - Date.now()) / 1000)
      return json({
        error: 'Too many failed login attempts. Please try again later.',
        locked: true,
        retry_after_seconds: retryAfter,
      }, 429)
    }

    // 2. Verify the password using an anon client (never trust the browser).
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false } }
    )
    const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password })

    if (error) {
      // An unconfirmed email isn't a wrong password — don't count it.
      if (/not confirmed/i.test(error.message)) {
        return json({ error: 'Please confirm your email first — check your inbox.', code: 'email_not_confirmed' }, 401)
      }

      // Wrong password: increment, and lock once the limit is reached.
      const nextCount = (lock?.failed_count ?? 0) + 1
      const locking = nextCount >= MAX_ATTEMPTS
      await admin.from('login_lockouts').upsert({
        email,
        failed_count: locking ? 0 : nextCount,
        locked_until: locking ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })

      if (locking) {
        return json({
          error: `Too many failed login attempts. Login locked for ${LOCK_MINUTES} minutes.`,
          locked: true,
          retry_after_seconds: LOCK_MINUTES * 60,
        }, 429)
      }
      // Generic message — don't reveal whether the email exists.
      return json({ error: 'Invalid email or password' }, 401)
    }

    // 3. Success — clear the counter and hand the session back to the client.
    await admin.from('login_lockouts').delete().eq('email', email)

    if (!signIn.session) return json({ error: 'Login failed' }, 401)
    return json({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    }, 200)

  } catch (err) {
    console.error('secure-login error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
