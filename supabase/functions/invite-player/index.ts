import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json('ok', 200)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Niet geauthenticeerd' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller identity using their own token
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await callerClient.auth.getUser()
    if (authError || !user) return json({ error: 'Ongeldige sessie' }, 401)

    const { email, full_name, jersey_number, role, team_id, redirect_url } = await req.json()
    if (!email || !full_name || !team_id) {
      return json({ error: 'email, full_name en team_id zijn verplicht' }, 400)
    }

    // Verify caller is team_admin or platform_admin
    const { data: membership } = await callerClient
      .from('team_memberships')
      .select('role')
      .eq('team_id', team_id)
      .eq('player_id', user.id)
      .eq('active', true)
      .single()

    if (membership?.role !== 'team_admin') {
      const { data: profile } = await callerClient
        .from('profiles').select('is_platform_admin').eq('id', user.id).single()
      if (!profile?.is_platform_admin) {
        return json({ error: 'Geen toestemming om spelers uit te nodigen' }, 403)
      }
    }

    // Use service role for the actual invite — never exposed to the browser
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const redirectTo = redirect_url || 'https://team.hockeyleidentoernooien.nl/set-password'
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), { redirectTo })

    if (inviteError) return json({ error: inviteError.message }, 400)

    const userId = inviteData.user?.id
    if (!userId) return json({ error: 'Gebruiker aangemaakt maar ID ontbreekt' }, 500)

    await adminClient.from('profiles').update({
      full_name: full_name.trim(),
      jersey_number: jersey_number ? parseInt(jersey_number) : null,
    }).eq('id', userId)

    await adminClient.from('team_memberships').upsert({
      team_id,
      player_id: userId,
      role: role || 'player',
      active: true,
    }, { onConflict: 'team_id,player_id' })

    return json({ ok: true, user_id: userId })

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
