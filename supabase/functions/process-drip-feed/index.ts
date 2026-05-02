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

    // Find drip feed orders due for their next run
    const { data: orders } = await adminClient
      .from('orders')
      .select('id, user_id, service_id, link, quantity, drip_quantity, drip_interval, drip_runs_total, drip_runs_done, services(exobooster_id)')
      .eq('is_drip_feed', true)
      .eq('status', 'in_progress')
      .lt('drip_next_run_at', new Date().toISOString())
      .not('drip_runs_done', 'is', null)
      .limit(50)

    if (!orders?.length) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    let processed = 0

    for (const order of orders) {
      try {
        const runsLeft = (order.drip_runs_total ?? 1) - (order.drip_runs_done ?? 0)
        if (runsLeft <= 0) {
          await adminClient.from('orders').update({
            status: 'completed',
            drip_next_run_at: null,
          }).eq('id', order.id)
          continue
        }

        // Calculate quantity for this run (last run may be smaller)
        const deliveredSoFar = (order.drip_runs_done ?? 0) * (order.drip_quantity ?? 0)
        const remaining = order.quantity - deliveredSoFar
        const thisRunQty = Math.min(order.drip_quantity ?? 0, remaining)

        if (thisRunQty <= 0) {
          await adminClient.from('orders').update({
            status: 'completed',
            drip_next_run_at: null,
          }).eq('id', order.id)
          continue
        }

        const service = order.services as { exobooster_id: number } | null
        if (!service) continue

        const result = await callExoBooster(apiKey, apiUrl, {
          action: 'add',
          service: service.exobooster_id,
          link: order.link,
          quantity: thisRunQty,
        }) as { order?: number; error?: string }

        if (result.error) {
          console.error(`Drip feed run failed for order ${order.id}:`, result.error)
          continue
        }

        const newRunsDone = (order.drip_runs_done ?? 0) + 1
        const allDone = newRunsDone >= (order.drip_runs_total ?? 1)
        const nextRunAt = allDone
          ? null
          : new Date(Date.now() + (order.drip_interval ?? 24) * 60 * 60 * 1000).toISOString()

        await adminClient.from('orders').update({
          drip_runs_done: newRunsDone,
          drip_next_run_at: nextRunAt,
          status: allDone ? 'completed' : 'in_progress',
        }).eq('id', order.id)

        processed++
      } catch (err) {
        console.error(`Error processing drip feed for order ${order.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
