import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Components that use the profile link (everything else uses the post link)
const PROFILE_LINK_COMPONENTS = new Set(['followers'])

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ComboItemRow {
  id: string
  component: string
  quantity: number
  services: {
    id: number
    exobooster_id: number
    name: string
    type: string | null
    rate: number
    min_quantity: number
    max_quantity: number
    is_active: boolean
  } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(authHeader)

    if (!userId) return json({ error: 'Unauthorized' }, 401)

    const { combo_id, profile_link, post_link } = await req.json()

    if (!combo_id) return json({ error: 'Missing combo_id' }, 400)

    // Load the active combo package
    const { data: combo, error: comboErr } = await adminClient
      .from('combo_packages')
      .select('id, platform, name, is_active')
      .eq('id', combo_id)
      .eq('is_active', true)
      .single()

    if (comboErr || !combo) return json({ error: 'Combo not found or inactive' }, 404)

    // Load its items joined with the underlying services
    const { data: rawItems } = await adminClient
      .from('combo_items')
      .select('id, component, quantity, services(id, exobooster_id, name, type, rate, min_quantity, max_quantity, is_active)')
      .eq('combo_id', combo_id)

    const items = (rawItems as ComboItemRow[] | null)?.filter(i => i.services && i.services.is_active) ?? []

    if (items.length === 0) return json({ error: 'This combo has no active services configured' }, 400)

    // Determine which links are required
    const needsProfile = items.some(i => PROFILE_LINK_COMPONENTS.has(i.component))
    const needsPost = items.some(i => !PROFILE_LINK_COMPONENTS.has(i.component))

    const isUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/.+/i.test(v.trim())

    if (needsProfile && !isUrl(profile_link)) return json({ error: 'A valid profile link is required' }, 400)
    if (needsPost && !isUrl(post_link)) return json({ error: 'A valid post link is required' }, 400)

    // Validate quantities against each service's min/max and compute total charge
    let totalCharge = 0
    for (const item of items) {
      const svc = item.services!
      if (item.quantity < svc.min_quantity || item.quantity > svc.max_quantity) {
        return json({
          error: `${item.component}: quantity ${item.quantity} is outside the allowed range (${svc.min_quantity}–${svc.max_quantity})`,
        }, 400)
      }
      totalCharge += (item.quantity / 1000) * svc.rate
    }
    totalCharge = Math.round(totalCharge * 10000) / 10000

    // Load profile & check balance
    const { data: profile } = await adminClient
      .from('profiles')
      .select('balance, total_spent, role, merchant_id')
      .eq('id', userId)
      .single()

    if (!profile) return json({ error: 'User profile not found' }, 404)
    if (profile.balance < totalCharge) return json({ error: 'Insufficient balance' }, 402)

    const comboLabel = `${combo.platform} ${combo.name} Booster`

    // ── Charge once ──────────────────────────────────────────
    const balanceBefore = profile.balance
    const balanceAfterCharge = Math.round((balanceBefore - totalCharge) * 10000) / 10000

    await adminClient
      .from('profiles')
      .update({ balance: balanceAfterCharge, total_spent: (profile.total_spent || 0) + totalCharge })
      .eq('id', userId)

    await adminClient.from('transactions').insert({
      user_id: userId,
      type: 'order_charge',
      amount: -totalCharge,
      balance_before: balanceBefore,
      balance_after: balanceAfterCharge,
      reference_id: null,
      description: comboLabel,
    })

    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    const comboGroupId = crypto.randomUUID()
    const results: Array<{
      component: string
      order_id: string | null
      exobooster_order_id: number | null
      status: string
      error?: string
    }> = []
    let refundTotal = 0

    // ── Fire one order per component ─────────────────────────
    for (const item of items) {
      const svc = item.services!
      const link = PROFILE_LINK_COMPONENTS.has(item.component) ? profile_link : post_link
      const itemCharge = Math.round((item.quantity / 1000) * svc.rate * 10000) / 10000

      const { data: order } = await adminClient
        .from('orders')
        .insert({
          user_id: userId,
          service_id: svc.id,
          link,
          quantity: item.quantity,
          charge: itemCharge,
          status: 'pending',
          combo_group_id: comboGroupId,
          combo_label: comboLabel,
        })
        .select()
        .single()

      if (!order) {
        refundTotal += itemCharge
        results.push({ component: item.component, order_id: null, exobooster_order_id: null, status: 'error', error: 'Failed to create order' })
        continue
      }

      try {
        const result = await callExoBooster(apiKey, apiUrl, {
          action: 'add',
          service: svc.exobooster_id,
          link,
          quantity: item.quantity,
        }) as { order?: number; error?: string }

        if (result.order) {
          await adminClient.from('orders').update({
            exobooster_order_id: result.order,
            status: 'processing',
          }).eq('id', order.id)
          results.push({ component: item.component, order_id: order.id, exobooster_order_id: result.order, status: 'processing' })
        } else {
          throw new Error(result.error || 'ExoBooster API error')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ExoBooster API error'
        await adminClient.from('orders').update({ status: 'error', error_message: message }).eq('id', order.id)
        refundTotal += itemCharge
        results.push({ component: item.component, order_id: order.id, exobooster_order_id: null, status: 'error', error: message })
      }
    }

    // ── Refund the portion that failed (single transaction) ──
    refundTotal = Math.round(refundTotal * 10000) / 10000
    if (refundTotal > 0.0001) {
      const { data: current } = await adminClient
        .from('profiles')
        .select('balance, total_spent')
        .eq('id', userId)
        .single()

      if (current) {
        const rBalanceBefore = current.balance
        const rBalanceAfter = Math.round((rBalanceBefore + refundTotal) * 10000) / 10000
        await adminClient
          .from('profiles')
          .update({ balance: rBalanceAfter, total_spent: Math.max(0, (current.total_spent || 0) - refundTotal) })
          .eq('id', userId)
        await adminClient.from('transactions').insert({
          user_id: userId,
          type: 'refund',
          amount: refundTotal,
          balance_before: rBalanceBefore,
          balance_after: rBalanceAfter,
          reference_id: null,
          description: `Refund for failed items in ${comboLabel}`,
        })
      }
    }

    const netCharge = Math.round((totalCharge - refundTotal) * 10000) / 10000

    // ── Merchant cashback (10%) on the net charged amount ────
    if (netCharge > 0.0001 && profile.role === 'merchant') {
      const cashback = Math.round(netCharge * 0.10 * 10000) / 10000
      if (cashback > 0.0001) {
        const { data: updatedProfile } = await adminClient
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single()
        if (updatedProfile) {
          const cbBefore = updatedProfile.balance
          const cbAfter = Math.round((cbBefore + cashback) * 10000) / 10000
          await adminClient.from('profiles').update({ balance: cbAfter }).eq('id', userId)
          await adminClient.from('transactions').insert({
            user_id: userId,
            type: 'merchant_commission',
            amount: cashback,
            balance_before: cbBefore,
            balance_after: cbAfter,
            reference_id: null,
            description: `10% cashback on ${comboLabel}`,
          })
        }
      }
    }

    // ── 5% referral commission to the referring merchant ─────
    if (netCharge > 0.0001 && profile.merchant_id) {
      const referralCommission = Math.round(netCharge * 0.05 * 10000) / 10000
      if (referralCommission > 0.0001) {
        const { data: merchant } = await adminClient
          .from('profiles')
          .select('balance')
          .eq('id', profile.merchant_id)
          .single()
        if (merchant) {
          const mBefore = merchant.balance
          const mAfter = Math.round((mBefore + referralCommission) * 10000) / 10000
          await adminClient.from('profiles').update({ balance: mAfter }).eq('id', profile.merchant_id)
          await adminClient.from('transactions').insert({
            user_id: profile.merchant_id,
            type: 'merchant_commission',
            amount: referralCommission,
            balance_before: mBefore,
            balance_after: mAfter,
            reference_id: null,
            description: `5% referral commission on ${comboLabel}`,
          })
        }
      }
    }

    const anySuccess = results.some(r => r.status === 'processing')
    if (!anySuccess) {
      return json({ error: 'All combo services failed. You have been fully refunded.', combo_group_id: comboGroupId, results }, 502)
    }

    return json({ success: true, combo_group_id: comboGroupId, results }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
