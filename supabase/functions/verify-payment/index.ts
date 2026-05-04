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

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(req.headers.get('Authorization'))

    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { reference, amount } = await req.json()

    if (!reference || !amount) return jsonResponse({ error: 'Missing reference or amount' }, 400)

    // Verify the payment with Korapay API — use only the server-verified amount, never the client-supplied amount
    const secretKey = await getSetting(adminClient, 'korapay_secret_key')
    let verifiedAmount = 0

    if (secretKey) {
      try {
        const res = await fetch(
          `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
          { headers: { Authorization: `Bearer ${secretKey}` } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data?.data?.status === 'success') {
            verifiedAmount = data?.data?.amount ?? 0
          }
        }
      } catch (err) {
        console.error('Korapay verify error:', err)
      }
    }

    if (verifiedAmount === 0) {
      return jsonResponse({ error: 'Payment could not be verified with Korapay' }, 402)
    }

    // Atomically claim the pending deposit by updating it to 'approved' in one DB round-trip.
    // The WHERE status='pending' condition means only the first concurrent caller wins —
    // the second will get no rows back and take the already-processed path.
    const { data: claimed } = await adminClient
      .from('deposit_requests')
      .update({
        status: 'approved',
        amount: verifiedAmount,
        flw_tx_id: reference,
        reviewed_at: new Date().toISOString(),
      })
      .eq('flw_tx_ref', reference)
      .eq('status', 'pending')
      .eq('user_id', userId)
      .select('id')
      .single()

    let depositId: string

    if (claimed) {
      depositId = claimed.id
    } else {
      // No pending deposit was claimed — check why
      const { data: existing } = await adminClient
        .from('deposit_requests')
        .select('id, status, user_id')
        .eq('flw_tx_ref', reference)
        .single()

      if (existing?.status === 'approved') {
        // Webhook or a concurrent verify-payment call already processed this
        return jsonResponse({ success: true, already_processed: true }, 200)
      }

      // Security: don't reveal whether a reference belongs to another user
      if (existing && existing.user_id !== userId) {
        return jsonResponse({ error: 'Payment reference not found' }, 404)
      }

      // No pre-created deposit exists (frontend failed to create one) — insert it now
      const { data: newDeposit, error: insertError } = await adminClient
        .from('deposit_requests')
        .insert({
          user_id: userId,
          amount: verifiedAmount,
          method: 'korapay',
          flw_tx_ref: reference,
          flw_tx_id: reference,
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (!newDeposit || insertError) {
        // Insert failed — unique constraint means a concurrent call just beat us to it
        const { data: race } = await adminClient
          .from('deposit_requests')
          .select('status')
          .eq('flw_tx_ref', reference)
          .single()
        if (race?.status === 'approved') {
          return jsonResponse({ success: true, already_processed: true }, 200)
        }
        console.error('Failed to record deposit:', insertError)
        return jsonResponse({ error: 'Failed to record deposit' }, 500)
      }

      depositId = newDeposit.id
    }

    // Credit the balance
    const { data: profile } = await adminClient
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (!profile) return jsonResponse({ error: 'User profile not found' }, 404)

    const balanceBefore = profile.balance
    const balanceAfter = balanceBefore + verifiedAmount

    await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', userId)

    await adminClient.from('transactions').insert({
      user_id: userId,
      type: 'deposit',
      amount: verifiedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: depositId,
      description: `Deposit via Korapay (${reference})`,
      status: 'completed',
    })

    return jsonResponse({ success: true, new_balance: balanceAfter }, 200)

  } catch (err) {
    console.error('verify-payment error:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
