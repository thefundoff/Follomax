// Pre-signup email validation. Does a live DNS lookup to confirm the email's
// domain can actually receive mail, so we never trigger a confirmation email to
// a dead/typo domain (e.g. chioma@hmail.com) — which is what drives bounce rates
// up and gets the project's email sending throttled.
//
// Called by RegisterPage BEFORE supabase.auth.signUp, so a rejected address
// never causes Supabase to send (and bounce) an email.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const { email } = await req.json()
    if (typeof email !== 'string' || !email.includes('@')) {
      return json({ valid: false, reason: 'invalid_format' }, 200)
    }

    const domain = email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase()
    if (!domain || !domain.includes('.')) {
      return json({ valid: false, reason: 'invalid_domain' }, 200)
    }

    // Look up MX records. A domain with no MX cannot receive mail, so any
    // confirmation sent to it would bounce.
    try {
      const mx = await Deno.resolveDns(domain, 'MX')
      if (Array.isArray(mx) && mx.length > 0) {
        return json({ valid: true }, 200)
      }
      // Resolved but empty — treat as undeliverable.
      return json({ valid: false, reason: 'no_mx' }, 200)
    } catch (err) {
      // NotFound = the domain / its MX records don't exist → undeliverable.
      if (err instanceof Deno.errors.NotFound) {
        return json({ valid: false, reason: 'no_mx' }, 200)
      }
      // Any other error (transient DNS hiccup, timeout) — fail OPEN so we never
      // block a real user because of a momentary lookup failure.
      console.error('MX lookup error for', domain, err)
      return json({ valid: true, reason: 'lookup_error' }, 200)
    }
  } catch (err) {
    console.error('validate-email error:', err)
    // On unexpected failure, don't block signup.
    return json({ valid: true, reason: 'internal_error' }, 200)
  }
})
