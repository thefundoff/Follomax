// Channel-agnostic onboarding/auth for Folly: passwordless account creation and
// existing-account login (email + password, with the same login_lockouts protection
// as the web login). Used by both the Telegram and WhatsApp adapters. Binding the
// channel id (telegram_user_id / whatsapp_id) is done via bindChannel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAdminClient } from './supabase-admin.ts'

type AdminClient = ReturnType<typeof getAdminClient>

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LOGIN_ATTEMPTS = 3
export const LOCK_MINUTES = 15

export function randomPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!'
}

export function welcomeText(firstName?: string): string {
  const name = firstName ? `, ${firstName}` : ''
  return `🎉 You're all set${name}! I'm Folly 🤖 — your Follomax assistant.\n\nTry:\n• "what Instagram followers do you have?"\n• "send 1000 likes to <link>"\n• "what's my balance?"\n• "status of my last order"`
}

// Detach `value` from any other profile on `column` (unique constraint), then bind it.
export async function bindChannel(admin: AdminClient, column: 'telegram_user_id' | 'whatsapp_id', value: string | number, userId: string) {
  await admin.from('profiles').update({ [column]: null }).eq(column, value)
  await admin.from('profiles').update({ [column]: value }).eq('id', userId)
}

// Create a passwordless Supabase account (the handle_new_user trigger creates the
// profile; referral_code metadata links the referring merchant). Caller binds the
// channel id + phone afterwards.
export async function createPasswordlessAccount(
  admin: AdminClient,
  email: string,
  fullName: string,
  ref: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; reason: 'exists' | 'error' }> {
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
  return { ok: true, userId: data.user.id }
}

// Verify an existing account's email + password with the same 3-strike / 15-min lockout
// as the web login.
export async function verifyLogin(
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
