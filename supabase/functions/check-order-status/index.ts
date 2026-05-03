import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const STATUS_MAP: Record<string, string> = {
  'Pending': 'pending',
  'In progress': 'in_progress',
  'Processing': 'processing',
  'Completed': 'completed',
  'Partial': 'partial',
  'Canceled': 'cancelled',
  'Cancelled': 'cancelled',
  'Error': 'error',
  'Fail': 'error',
  'Failed': 'error',
}

const CANCELLED_STATUSES = new Set(['Canceled', 'Cancelled', 'Error', 'Fail', 'Failed'])

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

async function callExoBooster(
  apiKey: string,
  apiUrl: string,
  params: Record<string, string | number>
): Promise<unknown> {
  const entries = Object.entries(params).map(([k, v]) => [k, String(v)])
  const body = new URLSearchParams({ key: apiKey, ...Object.fromEntries(entries) })
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return res.json()
}

async function issueRefund(
  adminClient: ReturnType<typeof getAdminClient>,
  userId: string,
  orderId: string,
  amount: number,
  description: string
) {
  const { data: profile } = await adminClient
    .from('profiles').select('balance').eq('id', userId).single()
  if (!profile || amount < 0.0001) return
  const balBefore = profile.balance
  const balAfter = balBefore + amount
  await adminClient.from('profiles').update({ balance: balAfter }).eq('id', userId)
  await adminClient.from('transactions').insert({
    user_id: userId,
    type: 'refund',
    amount,
    balance_before: balBefore,
    balance_after: balAfter,
    reference_id: orderId,
    description,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    // ── Part 1: Status check ──────────────────────────────────────────────────
    // Check:
    //   - All pending/processing orders
    //   - in_progress orders where drip_next_run_at IS NULL (all runs submitted,
    //     waiting for final ExoBooster status — fixes TikTok stuck-at-in_progress bug)
    const { data: orders } = await adminClient
      .from('orders')
      .select('id, user_id, exobooster_order_id, quantity, charge, status, is_drip_feed, drip_runs_done, drip_runs_total')
      .in('status', ['pending', 'processing', 'in_progress'])
      .not('exobooster_order_id', 'is', null)
      .or('is_drip_feed.eq.false,drip_next_run_at.is.null')
      .limit(100)

    let updated = 0

    if (orders?.length) {
      const orderIds = orders.map(o => o.exobooster_order_id).join(',')
      const results = await callExoBooster(apiKey, apiUrl, { action: 'status', orders: orderIds }) as Record<string, {
        status: string
        charge?: string
        start_count?: string
        remains?: string
      }>

      console.log('ExoBooster status response:', JSON.stringify(results))

      for (const order of orders) {
        const result = results[String(order.exobooster_order_id)]
        if (!result) continue

        const newStatus = STATUS_MAP[result.status] || order.status
        const startCount = result.start_count ? parseInt(result.start_count) : null
        const remains = result.remains ? parseInt(result.remains) : null

        await adminClient.from('orders').update({
          status: newStatus,
          start_count: startCount,
          remains,
        }).eq('id', order.id)

        if (newStatus === 'error') {
          // Full refund — order errored, nothing delivered
          const refundAmount = Math.round(order.charge * 10000) / 10000
          await issueRefund(
            adminClient, order.user_id, order.id, refundAmount,
            `Full refund for order #${order.id.slice(0, 8)} — order failed`
          )
        } else if ((newStatus === 'partial' || newStatus === 'cancelled') && remains && remains > 0) {
          const refundAmount = Math.round((remains / order.quantity) * order.charge * 10000) / 10000
          await issueRefund(
            adminClient, order.user_id, order.id, refundAmount,
            `Refund for order #${order.id.slice(0, 8)} — ${remains} undelivered`
          )
        }

        updated++
      }
    }

    // ── Part 2: Submit due Organix (drip feed) runs ───────────────────────────
    const now = new Date().toISOString()

    const { data: dripOrders } = await adminClient
      .from('orders')
      .select('id, user_id, service_id, link, charge, drip_quantity, drip_interval, drip_runs_done, drip_runs_total, drip_next_run_at, exobooster_order_id')
      .eq('is_drip_feed', true)
      .eq('status', 'in_progress')
      .lte('drip_next_run_at', now)
      .not('drip_next_run_at', 'is', null)
      .limit(50)

    for (const dripOrder of dripOrders ?? []) {

      // ── Check if the previous run was cancelled before submitting the next ──
      // Fixes: Facebook runs cancelled → no refund, order stuck at in_progress
      if (dripOrder.exobooster_order_id && (dripOrder.drip_runs_done ?? 0) > 0) {
        const prevResults = await callExoBooster(apiKey, apiUrl, {
          action: 'status',
          orders: String(dripOrder.exobooster_order_id),
        }) as Record<string, { status: string }>

        const prevStatus = prevResults[String(dripOrder.exobooster_order_id)]?.status

        if (prevStatus && CANCELLED_STATUSES.has(prevStatus)) {
          // Previous run was cancelled — stop the order and refund remaining runs
          const runsDone = dripOrder.drip_runs_done ?? 0
          const runsTotal = dripOrder.drip_runs_total ?? 0
          // +1 because the cancelled run (counted in runsDone) delivered nothing
          const undeliveredRuns = Math.max(0, runsTotal - runsDone + 1)
          const chargePerRun = runsTotal > 0 ? (dripOrder.charge ?? 0) / runsTotal : 0
          const refundAmount = Math.round(undeliveredRuns * chargePerRun * 10000) / 10000

          if (refundAmount > 0.001) {
            await issueRefund(
              adminClient, dripOrder.user_id, dripOrder.id, refundAmount,
              `Organix refund: ${undeliveredRuns} run(s) cancelled by provider on order #${dripOrder.id.slice(0, 8)}`
            )
          }

          await adminClient.from('orders').update({
            status: runsDone > 1 ? 'partial' : 'cancelled',
            drip_next_run_at: null,
            error_message: `Run ${runsDone} was cancelled by the provider. ${undeliveredRuns} run(s) refunded.`,
          }).eq('id', dripOrder.id)

          console.log(`Organix cancelled at run ${runsDone}/${runsTotal} for order ${dripOrder.id}, refunded ${undeliveredRuns} run(s)`)
          continue
        }
      }

      // ── Submit next run ───────────────────────────────────────────────────────
      const { data: service } = await adminClient
        .from('services')
        .select('exobooster_id')
        .eq('id', dripOrder.service_id)
        .single()

      if (!service) continue

      try {
        const result = await callExoBooster(apiKey, apiUrl, {
          action: 'add',
          service: service.exobooster_id,
          link: dripOrder.link,
          quantity: dripOrder.drip_quantity,
        }) as { order?: number; error?: string }

        if (result.error) throw new Error(result.error)

        const newRunsDone = (dripOrder.drip_runs_done ?? 0) + 1
        const isLastRun = dripOrder.drip_runs_total
          ? newRunsDone >= dripOrder.drip_runs_total
          : false

        await adminClient.from('orders').update({
          drip_runs_done: newRunsDone,
          exobooster_order_id: result.order ?? dripOrder.exobooster_order_id,
          drip_next_run_at: isLastRun ? null : new Date(Date.now() + dripOrder.drip_interval * 60 * 60 * 1000).toISOString(),
          status: isLastRun ? 'processing' : 'in_progress',
        }).eq('id', dripOrder.id)

        console.log(`Organix run submitted: order ${dripOrder.id}, run ${newRunsDone}/${dripOrder.drip_runs_total}`)
      } catch (err) {
        console.error(`Organix run failed for order ${dripOrder.id}:`, err instanceof Error ? err.message : err)
      }
    }

    return new Response(JSON.stringify({ success: true, updated, drip_runs: dripOrders?.length ?? 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
