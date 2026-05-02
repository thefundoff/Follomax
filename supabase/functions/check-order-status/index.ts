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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    // ── Part 1: Status check for regular orders + drip feed orders on their final run ──
    // Exclude in_progress drip feed orders — those are still mid-schedule and their
    // current exobooster_order_id only reflects one run, not the whole order.
    const { data: orders } = await adminClient
      .from('orders')
      .select('id, user_id, exobooster_order_id, quantity, charge, status, is_drip_feed')
      .in('status', ['pending', 'processing'])
      .not('exobooster_order_id', 'is', null)
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

        if ((newStatus === 'partial' || newStatus === 'cancelled') && remains && remains > 0) {
          const refundAmount = (remains / 1000) * (order.charge / order.quantity) * 1000
          if (refundAmount > 0.001) {
            const { data: profile } = await adminClient
              .from('profiles')
              .select('balance')
              .eq('id', order.user_id)
              .single()

            if (profile) {
              const balanceBefore = profile.balance
              const balanceAfter = balanceBefore + refundAmount
              await adminClient.from('profiles').update({ balance: balanceAfter }).eq('id', order.user_id)
              await adminClient.from('transactions').insert({
                user_id: order.user_id,
                type: 'refund',
                amount: refundAmount,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                reference_id: order.id,
                description: `Partial refund for order #${order.id.slice(0, 8)}`,
              })
            }
          }
        }

        updated++
      }
    }

    // ── Part 2: Submit due Organix (drip feed) runs ──
    const now = new Date().toISOString()

    const { data: dripOrders } = await adminClient
      .from('orders')
      .select('id, user_id, service_id, link, drip_quantity, drip_interval, drip_runs_done, drip_runs_total, drip_next_run_at, exobooster_order_id')
      .eq('is_drip_feed', true)
      .eq('status', 'in_progress')
      .lte('drip_next_run_at', now)
      .not('drip_next_run_at', 'is', null)
      .limit(50)

    for (const dripOrder of dripOrders ?? []) {
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
          // Track the latest run's ExoBooster ID so the status check above can finalise it
          exobooster_order_id: result.order ?? dripOrder.exobooster_order_id,
          // On the last run: null out next_run_at and move to 'processing' so Part 1 picks it up
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
