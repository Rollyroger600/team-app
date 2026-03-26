import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!

// Service-role client — bypasses RLS, used for credential operations
function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Caller client — uses caller's JWT, respects RLS
function callerClient(authHeader: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

/** Resolve authenticated caller; returns null and sends 401 if not auth'd */
async function resolveCaller(authHeader: string | null) {
  if (!authHeader) return null
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  // Use service-role admin client to validate the JWT — more reliable than anon client
  const svc = adminClient()
  const { data: { user }, error } = await svc.auth.getUser(token)
  if (error || !user) return null
  return { user, client: callerClient(authHeader) }
}

/** Check if caller is team_admin or platform_admin for the given team */
async function isAdminForTeam(callerUserId: string, teamId: string): Promise<boolean> {
  const svc = adminClient()
  const { data: membership } = await svc
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('player_id', callerUserId)
    .eq('active', true)
    .single()
  if (membership?.role === 'team_admin') return true

  const { data: profile } = await svc
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', callerUserId)
    .single()
  return profile?.is_platform_admin === true
}

/** Check if caller is club_admin for the club that owns this team, or platform_admin */
async function isClubAdminForTeam(callerUserId: string, teamId: string): Promise<boolean> {
  const svc = adminClient()
  const { data } = await svc.rpc('is_club_admin_for_team_as_user', { p_user_id: callerUserId, p_team_id: teamId })
  if (data) return true

  // Fallback: manual check
  const { data: team } = await svc.from('teams').select('club_id').eq('id', teamId).single()
  if (!team?.club_id) return false

  const { data: cm } = await svc
    .from('club_memberships')
    .select('role')
    .eq('club_id', team.club_id)
    .eq('player_id', callerUserId)
    .single()
  if (cm?.role === 'club_admin') return true

  const { data: profile } = await svc
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', callerUserId)
    .single()
  return profile?.is_platform_admin === true
}

// ── Action handlers ───────────────────────────────────────────────────────────

/**
 * create_player — creates a new player with PIN-based auth credentials
 * Caller must be team_admin, club_admin, or platform_admin
 */
async function createPlayer(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { team_id, full_name, display_name, jersey_number, role } = body
  if (!team_id || !full_name) {
    return json({ error: 'team_id en full_name zijn verplicht' }, 400)
  }

  const isAdmin = await isAdminForTeam(caller.user.id, team_id as string)
  if (!isAdmin) return json({ error: 'Geen toestemming om spelers aan te maken' }, 403)

  const svc = adminClient()
  const internalEmail    = `${crypto.randomUUID()}@team.internal`
  const internalPassword = randomString(32)

  // Create Supabase Auth user
  const { data: authUser, error: createError } = await svc.auth.admin.createUser({
    email: internalEmail,
    password: internalPassword,
    email_confirm: true,
    user_metadata: {
      full_name: (full_name as string).trim(),
      display_name: ((display_name as string) || (full_name as string)).trim(),
    },
  })
  if (createError || !authUser.user) {
    return json({ error: createError?.message ?? 'Kon gebruiker niet aanmaken' }, 500)
  }
  const playerId = authUser.user.id

  // Update profile with display_name and jersey_number
  const { error: profileError } = await svc.from('profiles').update({
    full_name: (full_name as string).trim(),
    display_name: ((display_name as string) || (full_name as string)).trim(),
    jersey_number: jersey_number ? parseInt(jersey_number as string) : null,
    email: internalEmail,
  }).eq('id', playerId)
  if (profileError) {
    await svc.auth.admin.deleteUser(playerId)
    return json({ error: 'Kon profiel niet bijwerken: ' + profileError.message }, 500)
  }

  // Store credentials (pin_hash null until player sets PIN)
  const { error: credError } = await svc.from('player_credentials').insert({
    player_id:         playerId,
    internal_email:    internalEmail,
    internal_password: internalPassword,
    pin_hash:          null,
    has_set_pin:       false,
    failed_attempts:   0,
  })
  if (credError) {
    await svc.auth.admin.deleteUser(playerId)
    return json({ error: 'Kon credentials niet opslaan: ' + credError.message }, 500)
  }

  // Add to team
  await svc.from('team_memberships').upsert({
    team_id,
    player_id: playerId,
    role:      role || 'player',
    active:    true,
  }, { onConflict: 'team_id,player_id' })

  return json({ ok: true, player_id: playerId })
}

/**
 * get_players_for_login — returns display names for the login name-picker
 * Unauthenticated — only returns display_name and jersey_number, no sensitive data
 */
async function getPlayersForLogin(body: Record<string, unknown>) {
  const { team_id, club_slug, team_slug } = body

  const svc = adminClient()
  let resolvedTeamId = team_id as string | undefined

  if (!resolvedTeamId && club_slug && team_slug) {
    const { data: club } = await svc.from('clubs').select('id').eq('slug', club_slug).single()
    if (!club) return json({ error: 'Club niet gevonden' }, 404)

    const { data: team } = await svc
      .from('teams')
      .select('id')
      .eq('club_id', club.id)
      .eq('slug', team_slug)
      .single()
    if (!team) return json({ error: 'Team niet gevonden' }, 404)
    resolvedTeamId = team.id
  }

  if (!resolvedTeamId) return json({ error: 'team_id of club_slug + team_slug vereist' }, 400)

  const { data, error } = await svc.rpc('get_team_players_for_login', { p_team_id: resolvedTeamId })
  if (error) return json({ error: error.message }, 500)

  // Fetch has_set_pin for each player so the client can skip to setup immediately
  const playerIds = (data || []).map((p: { player_id: string }) => p.player_id)
  if (playerIds.length === 0) return json({ players: [], team_id: resolvedTeamId })
  const { data: creds } = await svc
    .from('player_credentials')
    .select('player_id, has_set_pin')
    .in('player_id', playerIds)

  const credMap: Record<string, boolean> = {}
  for (const c of (creds || [])) credMap[c.player_id] = c.has_set_pin

  const players = (data || []).map((p: { player_id: string }) => ({
    ...p,
    has_set_pin: credMap[p.player_id] ?? false,
  }))

  return json({ players, team_id: resolvedTeamId })
}

/**
 * login — PIN-based login
 * Returns session on success, or needs_pin_setup flag if PIN not yet set
 */
async function login(body: Record<string, unknown>) {
  const { player_id, pin } = body
  if (!player_id || !pin) return json({ error: 'player_id en pin zijn verplicht' }, 400)

  const svc = adminClient()
  const { data: creds, error } = await svc
    .from('player_credentials')
    .select('*')
    .eq('player_id', player_id)
    .single()

  if (error || !creds) return json({ error: 'Speler niet gevonden' }, 404)

  // Check lockout
  if (creds.locked_until && new Date(creds.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(creds.locked_until).getTime() - Date.now()) / 60000)
    return json({ error: `Account geblokkeerd. Probeer over ${minutesLeft} minuten opnieuw.` }, 429)
  }

  // First login — PIN not yet set
  if (!creds.has_set_pin) {
    return json({ needs_pin_setup: true, player_id })
  }

  // Verify PIN
  const valid = await bcrypt.compare(pin as string, creds.pin_hash as string)

  if (!valid) {
    const attempts = (creds.failed_attempts ?? 0) + 1
    const lockedUntil = attempts >= 5
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null

    await svc.from('player_credentials').update({
      failed_attempts: attempts,
      locked_until:    lockedUntil,
    }).eq('player_id', player_id)

    if (lockedUntil) {
      return json({ error: 'Te veel foutieve pogingen. Account geblokkeerd voor 15 minuten.' }, 429)
    }
    return json({ error: 'Onjuiste PIN', attempts_left: 5 - attempts }, 401)
  }

  // PIN correct — reset counter and sign in
  await svc.from('player_credentials').update({
    failed_attempts: 0,
    locked_until:    null,
  }).eq('player_id', player_id)

  // First attempt at sign-in
  let { data: session, error: signInError } = await svc.auth.signInWithPassword({
    email:    creds.internal_email,
    password: creds.internal_password,
  })

  // If sign-in fails (e.g. missing auth.identities for SQL-created users), repair and retry once
  if (signInError) {
    await svc.auth.admin.updateUserById(player_id as string, {
      password: creds.internal_password,
    })
    ;({ data: session, error: signInError } = await svc.auth.signInWithPassword({
      email:    creds.internal_email,
      password: creds.internal_password,
    }))
  }

  if (signInError) return json({ error: signInError.message }, 500)

  return json({ session: session.session })
}

/**
 * set_pin — first-time PIN setup (unauthenticated)
 * Can only be called once — has_set_pin becomes true after this
 */
async function setPin(body: Record<string, unknown>) {
  const { player_id, pin } = body
  if (!player_id || !pin) return json({ error: 'player_id en pin zijn verplicht' }, 400)

  const pinStr = pin as string
  if (!/^\d{4,6}$/.test(pinStr)) {
    return json({ error: 'PIN moet 4 tot 6 cijfers bevatten' }, 400)
  }

  const svc = adminClient()
  const { data: creds } = await svc
    .from('player_credentials')
    .select('has_set_pin, internal_email, internal_password')
    .eq('player_id', player_id)
    .single()

  if (!creds) return json({ error: 'Speler niet gevonden' }, 404)
  if (creds.has_set_pin) {
    return json({ error: 'PIN is al ingesteld. Gebruik change_pin of vraag een reset aan.' }, 400)
  }

  const pinHash = await bcrypt.hash(pinStr, 10)
  const { error: updateCredError } = await svc.from('player_credentials').update({
    pin_hash:    pinHash,
    has_set_pin: true,
  }).eq('player_id', player_id)
  if (updateCredError) return json({ error: 'Kon PIN niet opslaan: ' + updateCredError.message }, 500)

  // Ensure the auth user is fully initialized via the admin API.
  // This creates the auth.identities row if it is missing, which happens
  // when a user was created via raw SQL instead of auth.admin.createUser().
  // Without this row, signInWithPassword returns "Database error querying schema".
  const { error: syncError } = await svc.auth.admin.updateUserById(player_id as string, {
    password: creds.internal_password,
  })
  if (syncError) return json({ error: 'Auth sync mislukt: ' + syncError.message }, 500)

  // Sign in and return session
  const { data: session, error: signInError } = await svc.auth.signInWithPassword({
    email:    creds.internal_email,
    password: creds.internal_password,
  })
  if (signInError) return json({ error: signInError.message }, 500)

  return json({ session: session.session })
}

/**
 * reset_pin — admin resets a player's PIN
 * team_admin can reset players; club_admin+ can reset team_admins
 */
async function resetPin(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { player_id, team_id } = body
  if (!player_id || !team_id) return json({ error: 'player_id en team_id zijn verplicht' }, 400)

  const isAdmin = await isAdminForTeam(caller.user.id, team_id as string)
  if (!isAdmin) return json({ error: 'Geen toestemming' }, 403)

  const svc = adminClient()
  await svc.from('player_credentials').update({
    pin_hash:        null,
    has_set_pin:     false,
    failed_attempts: 0,
    locked_until:    null,
  }).eq('player_id', player_id)

  return json({ ok: true })
}

/**
 * change_pin — authenticated player changes their own PIN
 */
async function changePin(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { current_pin, new_pin } = body
  if (!current_pin || !new_pin) {
    return json({ error: 'current_pin en new_pin zijn verplicht' }, 400)
  }

  const newPinStr = new_pin as string
  if (!/^\d{4,6}$/.test(newPinStr)) {
    return json({ error: 'Nieuwe PIN moet 4 tot 6 cijfers bevatten' }, 400)
  }

  const svc = adminClient()
  const { data: creds } = await svc
    .from('player_credentials')
    .select('pin_hash, has_set_pin')
    .eq('player_id', caller.user.id)
    .single()

  if (!creds) return json({ error: 'Speler niet gevonden' }, 404)
  if (!creds.has_set_pin || !creds.pin_hash) {
    return json({ error: 'Geen PIN ingesteld' }, 400)
  }

  const valid = await bcrypt.compare(current_pin as string, creds.pin_hash)
  if (!valid) return json({ error: 'Huidige PIN onjuist' }, 401)

  const newHash = await bcrypt.hash(newPinStr, 10)
  await svc.from('player_credentials').update({ pin_hash: newHash }).eq('player_id', caller.user.id)

  return json({ ok: true })
}

/**
 * change_role — club_admin+ changes a team member's role
 * team_admins cannot change roles (peer protection)
 */
async function changeRole(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { player_id, team_id, new_role } = body
  if (!player_id || !team_id || !new_role) {
    return json({ error: 'player_id, team_id en new_role zijn verplicht' }, 400)
  }
  if (!['player', 'team_admin'].includes(new_role as string)) {
    return json({ error: 'Ongeldig role. Kies player of team_admin.' }, 400)
  }

  const isClubAdmin = await isClubAdminForTeam(caller.user.id, team_id as string)
  if (!isClubAdmin) {
    return json({ error: 'Alleen club_admin of platform_admin kan rollen wijzigen' }, 403)
  }

  const svc = adminClient()
  const { error } = await svc.from('team_memberships')
    .update({ role: new_role })
    .eq('team_id', team_id)
    .eq('player_id', player_id)

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// ── Router ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok', 200)

  try {
    const body = await req.json() as Record<string, unknown>
    const { action } = body
    const authHeader = req.headers.get('Authorization')

    switch (action) {
      case 'create_player':       return createPlayer(body, authHeader)
      case 'get_players_for_login': return getPlayersForLogin(body)
      case 'login':               return login(body)
      case 'set_pin':             return setPin(body)
      case 'reset_pin':           return resetPin(body, authHeader)
      case 'change_pin':          return changePin(body, authHeader)
      case 'change_role':         return changeRole(body, authHeader)
      default:
        return json({ error: `Onbekende actie: ${action}` }, 400)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return json({ error: message }, 500)
  }
})
