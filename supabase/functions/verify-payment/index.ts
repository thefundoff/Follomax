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

async function getSetting(supabase: ReturnType<typeof getAdminClient>, key: string): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
  return (data?.value as string) || ''
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

    const { reference, amount } = await req.json()

    if (!reference || !amount) {
      return new Response(JSON.stringify({ error: 'Missing reference or amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotency: check if this reference was already processed
    const { data: existing } = await adminClient
      .from('deposit_requests')
      .select('id, status')
      .eq('flw_tx_ref', reference)
      .single()

    if (existing?.status === 'approved') {
      return new Response(JSON.stringify({ success: true, already_processed: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify payment with Korapay API
    const secretKey = await getSetting(adminClient, 'korapay_secret_key')
    let verified = false
    let verifiedAmount = amount

    if (secretKey) {
      try {
        const res = await fetch(
          `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
          { headers: { Authorization: `Bearer ${secretKey}` } }
        )
        if (res.ok) {
          const data = await res.json()
          const status = data?.data?.status
          const returnedAmount = data?.data?.amount ?? 0
          verified = status === 'success'
          verifiedAmount = returnedAmount
        }
      } catch (err) {
        console.error('Korapay verify error:', err)
      }
    }

    if (!verified) {
      return new Response(JSON.stringify({ error: 'Payment could not be verified with Korapay' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const creditAmount = amount
    const balanceBefore = profile.balance
    const balanceAfter = balanceBefore + creditAmount

    // Upsert deposit_request
    const { data: deposit } = await adminClient
      .from('deposit_requests')
      .upsert({
        ...(existing?.id ? { id: existing.id } : {}),
        user_id: userId,
        amount: creditAmount,
        method: 'korapay',
        flw_tx_ref: reference,
        flw_tx_id: reference,
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'flw_tx_ref' })
      .select('id')
      .single()

    if (!deposit) {
      return new Response(JSON.stringify({ error: 'Failed to record deposit' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Credit balance
    await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', userId)

    // Record transaction
    await adminClient.from('transactions').insert({
      user_id: userId,
      type: 'deposit',
      amount: creditAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: deposit.id,
      description: `Deposit via Korapay (${reference})`,
      status: 'completed',
    })

    return new Response(JSON.stringify({ success: true, new_balance: balanceAfter }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('verify-payment error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
