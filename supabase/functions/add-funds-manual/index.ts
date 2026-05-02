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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(req.headers.get('Authorization'))

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: admin } = await adminClient.from('profiles').select('role').eq('id', userId).single()
    if (admin?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { deposit_request_id, action, admin_note } = await req.json()

    const { data: deposit } = await adminClient
      .from('deposit_requests')
      .select('*')
      .eq('id', deposit_request_id)
      .eq('status', 'pending')
      .single()

    if (!deposit) {
      return new Response(JSON.stringify({ error: 'Deposit request not found or already processed' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'approve') {
      const { data: profile } = await adminClient.from('profiles').select('balance').eq('id', deposit.user_id).single()
      if (!profile) throw new Error('User profile not found')

      const balanceBefore = profile.balance
      const balanceAfter = balanceBefore + deposit.amount

      await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', deposit.user_id)
      await adminClient.from('transactions').insert({
        user_id: deposit.user_id,
        type: 'deposit',
        amount: deposit.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference_id: deposit.id,
        description: `Manual deposit approved by admin`,
        status: 'completed',
      })
    }

    await adminClient.from('deposit_requests').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      admin_note: admin_note || null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', deposit_request_id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
