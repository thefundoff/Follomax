// Single source of truth for placing an order against ExoBooster and settling the
// wallet. Both `place-order` (web app, JWT-authed) and `telegram-webhook` (Folly bot,
// service-role) call this so their behaviour is identical: validate → debit → submit
// to the provider → refund on failure → merchant cashback / referral commission.

import { getAdminClient, getSetting, callExoBooster } from './supabase-admin.ts'

type AdminClient = ReturnType<typeof getAdminClient>

export interface PlaceOrderInput {
  service_id: number | string
  link: string
  quantity?: number
  comments?: string
  is_drip_feed?: boolean
  drip_quantity?: number
  drip_interval?: number
}

export type PlaceOrderErrorCode =
  | 'missing_fields'
  | 'service_not_found'
  | 'quantity_out_of_range'
  | 'insufficient_balance'
  | 'profile_not_found'
  | 'provider_error'

export type PlaceOrderResult =
  | { success: true; order_id: string; exobooster_order_id: number | null }
  | { success: false; status: number; code: PlaceOrderErrorCode; error: string }

const isCustomComments = (type: string | null) => !!type && type.toLowerCase().includes('comment')

export async function placeOrderCore(
  admin: AdminClient,
  userId: string,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const {
    service_id,
    link,
    quantity: rawQuantity,
    comments,
    is_drip_feed = false,
    drip_quantity,
    drip_interval,
  } = input

  if (!service_id || !link) {
    return { success: false, status: 400, code: 'missing_fields', error: 'Missing required fields' }
  }

  if (is_drip_feed && (!drip_quantity || !drip_interval)) {
    return { success: false, status: 400, code: 'missing_fields', error: 'Drip feed requires drip_quantity and drip_interval' }
  }

  const { data: service, error: svcErr } = await admin
    .from('services')
    .select('*')
    .eq('id', service_id)
    .eq('is_active', true)
    .single()

  if (svcErr || !service) {
    return { success: false, status: 404, code: 'service_not_found', error: 'Service not found or inactive' }
  }

  const customComments = isCustomComments(service.type)

  // Derive quantity: custom-comment services use the number of comment lines,
  // everything else uses the provided number.
  let quantity: number
  let commentLines: string[] = []

  if (customComments) {
    if (!comments || typeof comments !== 'string' || comments.trim() === '') {
      return { success: false, status: 400, code: 'missing_fields', error: 'Comments are required for this service' }
    }
    commentLines = comments.split('\n').map((l) => l.trim()).filter(Boolean)
    quantity = commentLines.length
  } else {
    if (!rawQuantity) {
      return { success: false, status: 400, code: 'missing_fields', error: 'Missing required fields' }
    }
    quantity = rawQuantity
  }

  if (quantity < service.min_quantity || quantity > service.max_quantity) {
    return {
      success: false,
      status: 400,
      code: 'quantity_out_of_range',
      error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}`,
    }
  }

  if (is_drip_feed && drip_quantity! < service.min_quantity) {
    return {
      success: false,
      status: 400,
      code: 'quantity_out_of_range',
      error: `Drip quantity must be at least ${service.min_quantity}`,
    }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('balance, total_spent, role, merchant_id')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { success: false, status: 404, code: 'profile_not_found', error: 'User profile not found' }
  }

  const charge = (quantity / 1000) * service.rate

  if (profile.balance < charge) {
    return { success: false, status: 402, code: 'insufficient_balance', error: 'Insufficient balance' }
  }

  const dripRunsTotal = is_drip_feed ? Math.ceil(quantity / drip_quantity!) : null
  const firstRunQty = is_drip_feed ? drip_quantity! : quantity
  const dripNextRunAt = is_drip_feed
    ? new Date(Date.now() + drip_interval! * 60 * 60 * 1000).toISOString()
    : null

  const { data: order } = await admin
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
    return { success: false, status: 500, code: 'provider_error', error: 'Failed to create order' }
  }

  const balanceBefore = profile.balance
  const balanceAfter = balanceBefore - charge

  await admin
    .from('profiles')
    .update({ balance: balanceAfter, total_spent: (profile.total_spent || 0) + charge })
    .eq('id', userId)

  await admin.from('transactions').insert({
    user_id: userId,
    type: 'order_charge',
    amount: -charge,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    reference_id: order.id,
    description: `Order #${order.id.slice(0, 8)} - ${service.name}${is_drip_feed ? ' (Drip Feed)' : ''}`,
  })

  const apiKey = await getSetting(admin, 'exobooster_api_key')
  const apiUrl = await getSetting(admin, 'exobooster_api_url')

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

    const result = (await callExoBooster(apiKey, apiUrl, exoParams)) as { order?: number; error?: string }

    if (result.order) {
      exoboosterId = result.order
    } else if (result.error) {
      throw new Error(result.error)
    }
  } catch (err) {
    // Provider failed — refund the charge and mark the order errored.
    await admin.from('profiles').update({ balance: balanceBefore }).eq('id', userId)
    await admin.from('transactions').insert({
      user_id: userId,
      type: 'refund',
      amount: charge,
      balance_before: balanceAfter,
      balance_after: balanceBefore,
      reference_id: order.id,
      description: `Refund for failed order #${order.id.slice(0, 8)}`,
    })
    await admin.from('orders').update({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'ExoBooster API error',
    }).eq('id', order.id)

    return {
      success: false,
      status: 500,
      code: 'provider_error',
      error: 'Order failed: ' + (err instanceof Error ? err.message : 'API error'),
    }
  }

  await admin.from('orders').update({
    exobooster_order_id: exoboosterId,
    status: is_drip_feed ? 'in_progress' : 'processing',
    drip_runs_done: is_drip_feed ? 1 : 0,
    drip_next_run_at: is_drip_feed ? dripNextRunAt : null,
  }).eq('id', order.id)

  // 10% cashback for merchant accounts.
  if (profile.role === 'merchant') {
    const cashback = Math.round(charge * 0.10 * 10000) / 10000
    if (cashback > 0.0001) {
      const { data: updatedProfile } = await admin
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single()

      if (updatedProfile) {
        const cbBalanceBefore = updatedProfile.balance
        const cbBalanceAfter = cbBalanceBefore + cashback
        await admin.from('profiles').update({ balance: cbBalanceAfter }).eq('id', userId)
        await admin.from('transactions').insert({
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

  // 5% referral commission to the merchant who referred this user.
  if (profile.merchant_id) {
    const referralCommission = Math.round(charge * 0.05 * 10000) / 10000
    if (referralCommission > 0.0001) {
      const { data: merchant } = await admin
        .from('profiles')
        .select('balance')
        .eq('id', profile.merchant_id)
        .single()

      if (merchant) {
        const mBalanceBefore = merchant.balance
        const mBalanceAfter = mBalanceBefore + referralCommission
        await admin.from('profiles').update({ balance: mBalanceAfter }).eq('id', profile.merchant_id)
        await admin.from('transactions').insert({
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

  return { success: true, order_id: order.id, exobooster_order_id: exoboosterId }
}
