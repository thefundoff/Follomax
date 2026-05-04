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

async function getUserFromJWT(
  supabase: ReturnType<typeof getAdminClient>,
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(token)
  return user?.id || null
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
    const authHeader = req.headers.get('Authorization')
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(adminClient, authHeader)

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const {
      service_id,
      link,
      quantity: rawQuantity,
      comments,
      is_drip_feed = false,
      drip_quantity,
      drip_interval,
    } = await req.json()

    // For custom_comments services the quantity is derived from the comment count
    const isCustomComments = (type: string | null) => !!type && type.toLowerCase().includes('comment')

    if (!service_id || !link) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (is_drip_feed && (!drip_quantity || !drip_interval)) {
      return new Response(JSON.stringify({ error: 'Drip feed requires drip_quantity and drip_interval' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: service, error: svcErr } = await adminClient
      .from('services')
      .select('*')
      .eq('id', service_id)
      .eq('is_active', true)
      .single()

    if (svcErr || !service) {
      return new Response(JSON.stringify({ error: 'Service not found or inactive' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const customComments = isCustomComments(service.type)

    // Derive quantity: for custom_comments, count non-empty lines; otherwise use the provided number
    let quantity: number
    let commentLines: string[] = []

    if (customComments) {
      if (!comments || typeof comments !== 'string' || comments.trim() === '') {
        return new Response(JSON.stringify({ error: 'Comments are required for this service' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      commentLines = comments.split('\n').map((l: string) => l.trim()).filter(Boolean)
      quantity = commentLines.length
    } else {
      quantity = rawQuantity
      if (!quantity) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (quantity < service.min_quantity || quantity > service.max_quantity) {
      return new Response(
        JSON.stringify({ error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (is_drip_feed && drip_quantity < service.min_quantity) {
      return new Response(
        JSON.stringify({ error: `Drip quantity must be at least ${service.min_quantity}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('balance, total_spent, role, merchant_id')
      .eq('id', userId)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const charge = (quantity / 1000) * service.rate

    if (profile.balance < charge) {
      return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dripRunsTotal = is_drip_feed ? Math.ceil(quantity / drip_quantity) : null
    const firstRunQty = is_drip_feed ? drip_quantity : quantity
    const dripNextRunAt = is_drip_feed
      ? new Date(Date.now() + drip_interval * 60 * 60 * 1000).toISOString()
      : null

    const { data: order } = await adminClient
      .from('orders')
      .insert({
        user_id: userId,
        service_id: service.id,
        link,
        quantity,
        charge,
        status: 'pending',
        is_drip_feed,
        drip_quantity: is_drip_feed ? drip_quantity : null,
        drip_interval: is_drip_feed ? drip_interval : null,
        drip_runs_total: dripRunsTotal,
        drip_runs_done: 0,
        drip_next_run_at: null,
      })
      .select()
      .single()

    if (!order) {
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const balanceBefore = profile.balance
    const balanceAfter = balanceBefore - charge

    await adminClient
      .from('profiles')
      .update({ balance: balanceAfter, total_spent: (profile.total_spent || 0) + charge })
      .eq('id', userId)

    await adminClient.from('transactions').insert({
      user_id: userId,
      type: 'order_charge',
      amount: -charge,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: order.id,
      description: `Order #${order.id.slice(0, 8)} - ${service.name}${is_drip_feed ? ' (Drip Feed)' : ''}`,
    })

    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    let exoboosterId: number | null = null

    try {
      const exoParams: Record<string, string | number> = {
        action: 'add',
        service: service.exobooster_id,
        link,
      }
      if (customComments) {
        exoParams.comments = commentLines.join('\n')
      } else {
        exoParams.quantity = firstRunQty
      }

      const result = await callExoBooster(apiKey, apiUrl, exoParams) as { order?: number; error?: string }

      if (result.order) {
        exoboosterId = result.order
      } else if (result.error) {
        throw new Error(result.error)
      }
    } catch (err) {
      await adminClient.from('profiles').update({ balance: balanceBefore }).eq('id', userId)
      await adminClient.from('transactions').insert({
        user_id: userId,
        type: 'refund',
        amount: charge,
        balance_before: balanceAfter,
        balance_after: balanceBefore,
        reference_id: order.id,
        description: `Refund for failed order #${order.id.slice(0, 8)}`,
      })
      await adminClient.from('orders').update({
        status: 'error',
        error_message: err instanceof Error ? err.message : 'ExoBooster API error',
      }).eq('id', order.id)

      return new Response(
        JSON.stringify({ error: 'Order failed: ' + (err instanceof Error ? err.message : 'API error') }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await adminClient.from('orders').update({
      exobooster_order_id: exoboosterId,
      status: is_drip_feed ? 'in_progress' : 'processing',
      drip_runs_done: is_drip_feed ? 1 : 0,
      drip_next_run_at: is_drip_feed ? dripNextRunAt : null,
    }).eq('id', order.id)

    // 10% cashback for merchant accounts
    if (profile.role === 'merchant') {
      const cashback = Math.round(charge * 0.10 * 10000) / 10000
      if (cashback > 0.0001) {
        const { data: updatedProfile } = await adminClient
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single()

        if (updatedProfile) {
          const cbBalanceBefore = updatedProfile.balance
          const cbBalanceAfter = cbBalanceBefore + cashback
          await adminClient.from('profiles').update({ balance: cbBalanceAfter }).eq('id', userId)
          await adminClient.from('transactions').insert({
            user_id: userId,
            type: 'merchant_commission',
            amount: cashback,
            balance_before: cbBalanceBefore,
            balance_after: cbBalanceAfter,
            reference_id: order.id,
            description: `10% cashback on order #${order.id.slice(0, 8)} - ${service.name}`,
          })
        }
      }
    }

    // 5% referral commission to the merchant who referred this user
    if (profile.merchant_id) {
      const referralCommission = Math.round(charge * 0.05 * 10000) / 10000
      if (referralCommission > 0.0001) {
        const { data: merchant } = await adminClient
          .from('profiles')
          .select('balance')
          .eq('id', profile.merchant_id)
          .single()

        if (merchant) {
          const mBalanceBefore = merchant.balance
          const mBalanceAfter = mBalanceBefore + referralCommission
          await adminClient.from('profiles').update({ balance: mBalanceAfter }).eq('id', profile.merchant_id)
          await adminClient.from('transactions').insert({
            user_id: profile.merchant_id,
            type: 'merchant_commission',
            amount: referralCommission,
            balance_before: mBalanceBefore,
            balance_after: mBalanceAfter,
            reference_id: order.id,
            description: `5% referral commission on order #${order.id.slice(0, 8)} - ${service.name}`,
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, exobooster_order_id: exoboosterId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
