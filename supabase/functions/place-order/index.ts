// Web-app order endpoint. Authenticates the user via their Supabase JWT, then
// delegates to the shared placeOrderCore so the bot (Folly) and the web app run
// identical order logic. See supabase/functions/_shared/order-core.ts.

import { corsHeaders } from '../_shared/cors.ts'
import { getAdminClient, getUserFromJWT } from '../_shared/supabase-admin.ts'
import { placeOrderCore } from '../_shared/order-core.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(adminClient, req.headers.get('Authorization'))

    if (!userId) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const result = await placeOrderCore(adminClient, userId, body)

    if (!result.success) return json({ error: result.error }, result.status)

    return json(
      { success: true, order_id: result.order_id, exobooster_order_id: result.exobooster_order_id },
      200,
    )
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
