import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Only allow from localhost — refuse production origins
  const origin = req.headers.get('origin') || ''
  if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    return json({ error: 'Alleen beschikbaar in lokale ontwikkeling' }, 403)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Niet geauthenticeerd' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the caller is a platform_admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await callerClient.auth.getUser()
    if (!user) return json({ error: 'Ongeldige sessie' }, 401)

    const { data: profile } = await callerClient
      .from('profiles').select('is_platform_admin').eq('id', user.id).single()
    if (!profile?.is_platform_admin) {
      return json({ error: 'Alleen platform admins mogen van profiel wisselen' }, 403)
    }

    const { email } = await req.json()
    if (!email) return json({ error: 'email is verplicht' }, 400)

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (error || !data?.properties?.hashed_token) {
      return json({ error: error?.message || 'Kon geen login-token genereren' }, 400)
    }

    return json({ hashed_token: data.properties.hashed_token })

  } catch (err) {
    return json({ error: err.message || 'Onbekende fout' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
