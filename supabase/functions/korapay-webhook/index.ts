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

async function getSetting(
  supabase: ReturnType<typeof getAdminClient>,
  key: string
): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
  return (data?.value as string) || ''
}

async function verifyWithKorapay(
  secretKey: string,
  reference: string
): Promise<{ valid: boolean; amount: number }> {
  const res = await fetch(
    `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) return { valid: false, amount: 0 }
  const data = await res.json()
  const isSuccess = data?.data?.status === 'success'
  const amount = data?.data?.amount ?? 0
  return { valid: isSuccess, amount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const payload = await req.json()

    if (payload.event !== 'charge.success') {
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    const reference = payload.data?.reference
    if (!reference) {
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    const adminClient = getAdminClient()
    const secretKey = await getSetting(adminClient, 'korapay_secret_key')

    // Confirm the payment actually succeeded by asking Korapay's API directly.
    // This is the primary trust check — we never rely solely on the webhook payload.
    const { valid, amount } = await verifyWithKorapay(secretKey, reference)

    if (!valid) {
      console.error('Korapay verification failed for reference:', reference)
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    // Atomically claim the pending deposit — only one concurrent caller (webhook or
    // verify-payment) can win this UPDATE. If the row is already 'approved', this
    // returns no rows and we skip without double-crediting.
    const { data: deposit } = await adminClient
      .from('deposit_requests')
      .update({
        status: 'approved',
        flw_tx_id: reference,
        reviewed_at: new Date().toISOString(),
      })
      .eq('flw_tx_ref', reference)
      .eq('status', 'pending')
      .select('id, user_id, amount')
      .single()

    if (!deposit) {
      // Already processed by verify-payment or a prior webhook delivery
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    // Verify amount matches (allow ₦1 tolerance) — mark failed if mismatch
    if (Math.abs(deposit.amount - amount) > 1) {
      await adminClient
        .from('deposit_requests')
        .update({
          status: 'failed',
          admin_note: `Amount mismatch: expected ₦${deposit.amount}, got ₦${amount}`,
        })
        .eq('id', deposit.id)
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('balance')
      .eq('id', deposit.user_id)
      .single()

    if (!profile) return new Response('OK', { status: 200, headers: corsHeaders })

    const balanceBefore = profile.balance
    const balanceAfter = balanceBefore + deposit.amount

    await adminClient
      .from('profiles')
      .update({ balance: balanceAfter })
      .eq('id', deposit.user_id)

    await adminClient.from('transactions').insert({
      user_id: deposit.user_id,
      type: 'deposit',
      amount: deposit.amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: deposit.id,
      description: `Deposit via Korapay (${reference})`,
      status: 'completed',
    })

    return new Response('OK', { status: 200, headers: corsHeaders })

  } catch (err) {
    console.error('Korapay webhook error:', err)
    return new Response('OK', { status: 200, headers: corsHeaders })
  }
})
