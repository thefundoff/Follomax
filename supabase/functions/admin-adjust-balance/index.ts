import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

async function getUserFromJWT(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(token)
  return user?.id || null
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const callerId = await getUserFromJWT(req.headers.get('Authorization'))
    if (!callerId) return json({ error: 'Unauthorized' }, 401)

    // Caller must be an admin.
    const { data: caller } = await adminClient.from('profiles').select('role').eq('id', callerId).single()
    if (caller?.role !== 'admin') return json({ error: 'Admin access required' }, 403)

    const { user_id, amount, note } = await req.json()

    if (!user_id || typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      return json({ error: 'Invalid adjustment: amount must be a non-zero number' }, 400)
    }

    const { data: target } = await adminClient
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single()

    if (!target) return json({ error: 'User not found' }, 404)

    const balanceBefore = target.balance
    // Clamp at zero (mirrors the previous UI behaviour) and record the delta
    // that was actually applied, not the requested one.
    const balanceAfter = Math.max(0, balanceBefore + amount)
    const applied = balanceAfter - balanceBefore

    await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', user_id)

    // Audit row: every admin balance change now leaves a transaction record,
    // tagging which admin made it (reference_id) and an optional note.
    const trimmedNote = typeof note === 'string' ? note.trim() : ''
    await adminClient.from('transactions').insert({
      user_id,
      type: 'admin_adjustment',
      amount: applied,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: callerId,
      description: trimmedNote
        ? `Admin adjustment (${callerId.slice(0, 8)}): ${trimmedNote}`
        : `Admin balance adjustment by ${callerId.slice(0, 8)}`,
      status: 'completed',
    })

    return json({ success: true, new_balance: balanceAfter, applied }, 200)

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
