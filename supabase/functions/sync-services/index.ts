import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  return null
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getIcon(category: string): string {
  const lower = category.toLowerCase()
  if (lower.includes('instagram')) return '📸'
  if (lower.includes('youtube')) return '▶️'
  if (lower.includes('tiktok')) return '🎵'
  if (lower.includes('twitter') || lower.includes('x ')) return '🐦'
  if (lower.includes('facebook')) return '👤'
  if (lower.includes('telegram')) return '✈️'
  if (lower.includes('spotify')) return '🎧'
  if (lower.includes('linkedin')) return '💼'
  if (lower.includes('snapchat')) return '👻'
  if (lower.includes('twitch')) return '🎮'
  return '📱'
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const authHeader = req.headers.get('Authorization')
    const adminClient = getAdminClient()
    const userId = await getUserFromJWT(adminClient, authHeader)

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = await getSetting(adminClient, 'exobooster_api_key')
    const apiUrl = await getSetting(adminClient, 'exobooster_api_url')

    if (!apiKey || apiKey === 'REPLACE_WITH_YOUR_EXOBOOSTER_API_KEY') {
      return new Response(
        JSON.stringify({ error: 'ExoBooster API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const servicesData = await callExoBooster(apiKey, apiUrl, {
      action: 'services',
    }) as Array<{
      service: number
      name: string
      type: string
      category: string
      rate: string
      min: string
      max: string
      description?: string
      refill?: boolean
      cancel?: boolean
    }>

    if (!Array.isArray(servicesData)) {
      return new Response(
        JSON.stringify({ error: 'Invalid response from ExoBooster', received: servicesData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let categoriesCreated = 0
    const categoryCache: Record<string, number> = {}

    const { data: existingCats } = await adminClient
      .from('categories')
      .select('id, name')

    existingCats?.forEach(c => {
      categoryCache[c.name] = c.id
    })

    for (const svc of servicesData) {
      const catName = svc.category || 'Other'

      if (!categoryCache[catName]) {
        const { data: cat } = await adminClient
          .from('categories')
          .upsert(
            { name: catName, slug: slugify(catName), icon: getIcon(catName) },
            { onConflict: 'name' }
          )
          .select('id')
          .single()

        if (cat) {
          categoryCache[catName] = cat.id
          categoriesCreated++
        }
      }

      const serviceRow = {
        exobooster_id: svc.service,
        category_id: categoryCache[catName] || null,
        name: svc.name,
        type: svc.type || null,
        rate: parseFloat(svc.rate),
        min_quantity: parseInt(svc.min),
        max_quantity: parseInt(svc.max),
        description: svc.description || null,
        refill: svc.refill || false,
        cancel: svc.cancel || false,
        last_synced_at: new Date().toISOString(),
      }

      await adminClient
        .from('services')
        .upsert(serviceRow, { onConflict: 'exobooster_id' })
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: servicesData.length,
        categories_created: categoriesCreated,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
