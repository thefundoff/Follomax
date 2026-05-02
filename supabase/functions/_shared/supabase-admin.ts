import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

export async function getSetting(supabase: ReturnType<typeof getAdminClient>, key: string): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
  return (data?.value as string) || ''
}

export async function getUserFromJWT(supabase: ReturnType<typeof getAdminClient>, authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(token)
  return user?.id || null
}

export async function callExoBooster(apiKey: string, apiUrl: string, params: Record<string, string | number>): Promise<unknown> {
  const body = new URLSearchParams({ key: apiKey, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return res.json()
}
