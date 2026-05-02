import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAdminClient, getSetting } from '../_shared/supabase-admin.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const adminClient = getAdminClient()
    const secretHash = await getSetting(adminClient, 'flw_webhook_secret_hash')

    // Verify Flutterwave signature
    const verifyHash = req.headers.get('verif-hash')
    if (!verifyHash || verifyHash !== secretHash) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const payload = await req.json()

    if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
      const { tx_ref, id: flwTxId, amount, currency } = payload.data

      // Find the deposit request
      const { data: deposit } = await adminClient
        .from('deposit_requests')
        .select('*')
        .eq('flw_tx_ref', tx_ref)
        .eq('status', 'pending')
        .single()

      if (!deposit) {
        // Already processed or not found
        return new Response('OK', { status: 200, headers: corsHeaders })
      }

      // Verify amount (allow slight tolerance for currency conversion)
      if (Math.abs(deposit.amount - amount) > 0.5) {
        await adminClient.from('deposit_requests').update({
          status: 'failed',
          admin_note: `Amount mismatch: expected ${deposit.amount}, got ${amount} ${currency}`,
        }).eq('id', deposit.id)
        return new Response('OK', { status: 200, headers: corsHeaders })
      }

      // Get user's current balance
      const { data: profile } = await adminClient
        .from('profiles')
        .select('balance')
        .eq('id', deposit.user_id)
        .single()

      if (!profile) {
        return new Response('OK', { status: 200, headers: corsHeaders })
      }

      const balanceBefore = profile.balance
      const balanceAfter = balanceBefore + deposit.amount

      // Credit balance
      await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', deposit.user_id)

      // Record transaction
      await adminClient.from('transactions').insert({
        user_id: deposit.user_id,
        type: 'deposit',
        amount: deposit.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference_id: deposit.id,
        description: `Deposit via Flutterwave (${flwTxId})`,
        status: 'completed',
      })

      // Update deposit request
      await adminClient.from('deposit_requests').update({
        status: 'approved',
        flw_tx_id: String(flwTxId),
        reviewed_at: new Date().toISOString(),
      }).eq('id', deposit.id)
    }

    return new Response('OK', { status: 200, headers: corsHeaders })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('OK', { status: 200, headers: corsHeaders }) // Always return 200 to FLW
  }
})
