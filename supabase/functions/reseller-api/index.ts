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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const body = await req.json()
    const { key, action, ...params } = body

    if (!key || !action) {
      return new Response(JSON.stringify({ error: 'Missing key or action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, balance, is_active, role')
      .eq('api_key', key)
      .single()

    if (!profile || !profile.is_active) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'balance') {
      return new Response(JSON.stringify({ balance: profile.balance.toFixed(4) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'services') {
      const { data: services } = await adminClient
        .from('services')
        .select('exobooster_id, name, type, rate, min_quantity, max_quantity, categories(name)')
        .eq('is_active', true)
        .order('exobooster_id')

      const formatted = services?.map(s => ({
        service: s.exobooster_id,
        name: s.name,
        type: s.type || 'Default',
        category: (s.categories as { name: string } | null)?.name || 'Other',
        rate: s.rate.toFixed(6),
        min: s.min_quantity,
        max: s.max_quantity,
      }))

      return new Response(JSON.stringify(formatted), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'add') {
      const { service: serviceId, link, quantity } = params

      const { data: service } = await adminClient
        .from('services')
        .select('*')
        .eq('exobooster_id', serviceId)
        .eq('is_active', true)
        .single()

      if (!service) {
        return new Response(JSON.stringify({ error: 'Service not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const qty = parseInt(quantity)
      if (!Number.isInteger(qty) || qty < service.min_quantity || qty > service.max_quantity) {
        return new Response(JSON.stringify({ error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const charge = (qty / 1000) * service.rate
      const { data: freshProfile } = await adminClient.from('profiles').select('balance').eq('id', profile.id).single()

      if (!freshProfile || freshProfile.balance < charge) {
        return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: order } = await adminClient.from('orders').insert({
        user_id: profile.id,
        service_id: service.id,
        link,
        quantity: qty,
        charge,
        status: 'pending',
      }).select().single()

      if (!order) throw new Error('Failed to create order')

      const balanceBefore = freshProfile.balance
      await adminClient.from('profiles').update({ balance: balanceBefore - charge }).eq('id', profile.id)
      await adminClient.from('transactions').insert({
        user_id: profile.id,
        type: 'order_charge',
        amount: -charge,
        balance_before: balanceBefore,
        balance_after: balanceBefore - charge,
        reference_id: order.id,
        description: `API order - ${service.name}`,
      })

      return new Response(JSON.stringify({ order: order.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'status') {
      const { order: orderIds } = params
      const ids = String(orderIds).split(',').map((s: string) => s.trim())

      const { data: orders } = await adminClient
        .from('orders')
        .select('id, exobooster_order_id, status, charge, start_count, remains, quantity')
        .in('id', ids)
        .eq('user_id', profile.id)

      const result: Record<string, unknown> = {}
      orders?.forEach(o => {
        result[o.id] = {
          status: o.status.replace('_', ' '),
          charge: o.charge.toFixed(4),
          start_count: o.start_count || 0,
          remains: o.remains ?? o.quantity,
        }
      })

      return new Response(JSON.stringify(result), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
