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

/**
 * Check if caller is team_admin, team_owner, or platform_admin.
 *
 * 'team_owner' MUST stay in this list. Migratie 20260814_team_owner_role.sql promoveerde
 * élke bestaande team_admin naar team_owner, dus zonder die waarde kan een hoofdbeheerder
 * die géén platform-admin is geen speler aanmaken, PIN resetten, impersoneren of aanvoerder
 * zetten. Dat bleef onopgemerkt omdat de enige owner toevallig ook platform-admin is en dus
 * via de fallthrough hieronder binnenkwam. Spiegelt SQL is_team_admin(), die owner ook
 * meeneemt.
 */
async function isAdminForTeam(callerUserId: string, teamId: string): Promise<boolean> {
  const svc = adminClient()
  const { data: membership } = await svc
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('player_id', callerUserId)
    .eq('active', true)
    .single()
  if (membership?.role === 'team_admin' || membership?.role === 'team_owner') return true

  return isClubAdminForTeam(callerUserId, teamId)
}

/**
 * Check if caller is platform_admin. The separate club_admin tier has been collapsed
 * into platform_admin — this app now manages a single team, so a club-scoped admin
 * role added no real distinction. Kept as its own function (rather than inlining
 * isPlatformAdmin everywhere) so every caller (isAdminForTeam, changeRole, ...)
 * automatically follows if a club_admin tier is ever reintroduced.
 */
async function isClubAdminForTeam(callerUserId: string, _teamId: string): Promise<boolean> {
  const svc = adminClient()
  const { data: profile } = await svc
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', callerUserId)
    .single()
  return profile?.is_platform_admin === true
}

// ── Action handlers ───────────────────────────────────────────────────────────

/** Naam → url-veilige slug. Diakrieten eruit, alles wat geen letter/cijfer is wordt een streepje. */
function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'team'
}

/**
 * Zoekt een vrije slug in een tabel. teams.slug is GLOBAAL uniek (niet per club), dus
 * twee clubs kunnen niet allebei 'heren-1' hebben — vandaar de -2/-3 suffix.
 */
async function uniqueSlug(svc: ReturnType<typeof adminClient>, table: string, base: string): Promise<string> {
  let candidate = base
  for (let i = 2; i < 50; i++) {
    const { data } = await svc.from(table).select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${i}`
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`
}

interface ProvisionedPlayer { playerId: string }

/**
 * Maakt een compleet speler-account: shadow auth-user + profiel + PIN-credentials.
 * Gedeeld door create_player en create_team, zodat er maar één plek is die weet hoe
 * een speler ontstaat. Voegt bewust GEEN membership toe — dat doet de aanroeper, die
 * weet in welk team en met welke rol.
 *
 * Bij een fout onderweg wordt de auth-user weer verwijderd, anders blijft er een
 * account zonder profiel/credentials achter waar niemand meer bij kan.
 */
async function provisionPlayer(
  svc: ReturnType<typeof adminClient>,
  opts: { full_name: string; display_name?: string; jersey_number?: unknown },
): Promise<ProvisionedPlayer | { error: string }> {
  const internalEmail    = `${crypto.randomUUID()}@team.internal`
  const internalPassword = randomString(32)
  const fullName    = opts.full_name.trim()
  const displayName = (opts.display_name || opts.full_name).trim()

  const { data: authUser, error: createError } = await svc.auth.admin.createUser({
    email: internalEmail,
    password: internalPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, display_name: displayName },
  })
  if (createError || !authUser.user) {
    return { error: createError?.message ?? 'Kon gebruiker niet aanmaken' }
  }
  const playerId = authUser.user.id

  const { error: profileError } = await svc.from('profiles').update({
    full_name:     fullName,
    display_name:  displayName,
    jersey_number: opts.jersey_number ? parseInt(opts.jersey_number as string) : null,
    email:         internalEmail,
  }).eq('id', playerId)
  if (profileError) {
    await svc.auth.admin.deleteUser(playerId)
    return { error: 'Kon profiel niet bijwerken: ' + profileError.message }
  }

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
    return { error: 'Kon credentials niet opslaan: ' + credError.message }
  }

  return { playerId }
}

/**
 * create_player — creates a new player with PIN-based auth credentials
 * Caller must be team_admin, team_owner, or platform_admin
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
  const result = await provisionPlayer(svc, {
    full_name: full_name as string,
    display_name: display_name as string | undefined,
    jersey_number,
  })
  if ('error' in result) return json({ error: result.error }, 500)

  await svc.from('team_memberships').upsert({
    team_id,
    player_id: result.playerId,
    role:      role || 'player',
    active:    true,
  }, { onConflict: 'team_id,player_id' })

  return json({ ok: true, player_id: result.playerId })
}

/**
 * create_team — platform_admin maakt een nieuw team aan, met meteen een hoofdbeheerder.
 *
 * Vervangt het handmatige, becommentarieerde stapje in supabase/seed_pilot.sql. Bewust
 * géén zelfregistratie vanaf het inlogscherm: teams ontstaan alleen doordat de
 * platform-admin ze aanmaakt.
 *
 * Club: of een bestaande (club_id), of een nieuwe op naam (club_name). Slugs worden
 * gegenereerd en ontdubbeld, want die waren er nergens en de deeplink /login?club=&team=
 * draait erop.
 */
async function createTeam(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  // Team aanmaken is teamoverstijgend, dus expliciet platform-admin. isClubAdminForTeam
  // is hier de bestaande naam voor die check (het club_admin-niveau is samengevouwen).
  const isPlatformAdmin = await isClubAdminForTeam(caller.user.id, '')
  if (!isPlatformAdmin) {
    return json({ error: 'Alleen de platform-admin kan een team aanmaken' }, 403)
  }

  const { club_id, club_name, team_name, season, owner_full_name, owner_display_name } = body
  if (!team_name || !owner_full_name) {
    return json({ error: 'team_name en owner_full_name zijn verplicht' }, 400)
  }
  if (!club_id && !club_name) {
    return json({ error: 'Kies een bestaande club (club_id) of geef een naam op (club_name)' }, 400)
  }

  const svc = adminClient()

  // 1. Club: bestaande of nieuwe
  let resolvedClubId = club_id as string | undefined
  if (!resolvedClubId) {
    const clubSlug = await uniqueSlug(svc, 'clubs', slugify(club_name as string))
    const { data: club, error: clubError } = await svc.from('clubs')
      .insert({ name: (club_name as string).trim(), slug: clubSlug })
      .select('id').single()
    if (clubError || !club) {
      return json({ error: 'Kon club niet aanmaken: ' + (clubError?.message ?? '') }, 500)
    }
    resolvedClubId = club.id
  }

  // 2. Team
  const teamSlug = await uniqueSlug(svc, 'teams', slugify(team_name as string))
  const { data: team, error: teamError } = await svc.from('teams')
    .insert({
      club_id: resolvedClubId,
      name:    (team_name as string).trim(),
      slug:    teamSlug,
      season:  (season as string) || null,
    })
    .select('id').single()
  if (teamError || !team) {
    return json({ error: 'Kon team niet aanmaken: ' + (teamError?.message ?? '') }, 500)
  }

  // 3. Eerste speler, meteen als hoofdbeheerder — anders is het team onbeheerbaar.
  const provisioned = await provisionPlayer(svc, {
    full_name: owner_full_name as string,
    display_name: owner_display_name as string | undefined,
  })
  if ('error' in provisioned) {
    // Team en eventuele club blijven staan; opruimen zou de platform-admin verrassen
    // als er al iets goed ging. De fout is duidelijk genoeg om handmatig af te maken.
    return json({ error: provisioned.error }, 500)
  }

  const { error: membershipError } = await svc.from('team_memberships').insert({
    team_id:   team.id,
    player_id: provisioned.playerId,
    role:      'team_owner',
    active:    true,
  })
  if (membershipError) {
    return json({ error: 'Kon hoofdbeheerder niet koppelen: ' + membershipError.message }, 500)
  }

  return json({
    ok: true,
    team_id:   team.id,
    club_id:   resolvedClubId,
    team_slug: teamSlug,
    owner_player_id: provisioned.playerId,
  })
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

  const { data: session, error: signInError } = await svc.auth.signInWithPassword({
    email:    creds.internal_email,
    password: creds.internal_password,
  })
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
 * set_captain — toggle a player's team-captain flag
 * Purely informational (roster label) — no permission implications.
 * Same threshold as reset_pin/impersonate (team_admin, club_admin, or platform_admin).
 */
async function setCaptain(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { player_id, team_id, is_captain } = body
  if (!player_id || !team_id || typeof is_captain !== 'boolean') {
    return json({ error: 'player_id, team_id en is_captain zijn verplicht' }, 400)
  }

  const isAdmin = await isAdminForTeam(caller.user.id, team_id as string)
  if (!isAdmin) return json({ error: 'Geen toestemming' }, 403)

  const svc = adminClient()
  const { error } = await svc.from('team_memberships')
    .update({ is_captain })
    .eq('team_id', team_id)
    .eq('player_id', player_id)

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

/**
 * impersonate — admin logs in as a player, for support/testing
 * Never needs the player's PIN — the admin's own authority is the check.
 * Same team_admin+ threshold as reset_pin/create_player.
 */
async function impersonate(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { player_id, team_id } = body
  if (!player_id || !team_id) return json({ error: 'player_id en team_id zijn verplicht' }, 400)

  const isAdmin = await isAdminForTeam(caller.user.id, team_id as string)
  if (!isAdmin) return json({ error: 'Geen toestemming' }, 403)

  const svc = adminClient()
  const { data: creds } = await svc
    .from('player_credentials')
    .select('internal_email, internal_password')
    .eq('player_id', player_id)
    .single()
  if (!creds) return json({ error: 'Speler niet gevonden' }, 404)

  const { data: session, error: signInError } = await svc.auth.signInWithPassword({
    email:    creds.internal_email,
    password: creds.internal_password,
  })
  if (signInError) return json({ error: signInError.message }, 500)

  return json({ session: session.session })
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
 * get_players_status — returns PIN/lock status per player for admin view
 * Caller must be team_admin or higher
 */
async function getPlayersStatus(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { team_id } = body
  if (!team_id) return json({ error: 'team_id vereist' }, 400)

  const isAdmin = await isAdminForTeam(caller.user.id, team_id as string)
  if (!isAdmin) return json({ error: 'Geen toestemming' }, 403)

  const svc = adminClient()
  const { data: memberships } = await svc
    .from('team_memberships')
    .select('player_id')
    .eq('team_id', team_id)
    .eq('active', true)

  const playerIds = (memberships || []).map((m: { player_id: string }) => m.player_id)
  if (playerIds.length === 0) return json({ statuses: [] })

  const { data: creds } = await svc
    .from('player_credentials')
    .select('player_id, has_set_pin, failed_attempts, locked_until')
    .in('player_id', playerIds)

  return json({ statuses: creds || [] })
}

/**
 * change_role — platform_admin or team_owner changes a team member's role
 * - platform_admin: mag alles, in elk team (player/team_admin/team_owner) — de enige
 *   overgebleven exclusiviteit t.o.v. team_owner is dat dit over alle teams heen werkt
 * - team_owner: mag binnen zijn eigen team elke rol toekennen, inclusief andere
 *   hoofdbeheerders aanwijzen/degraderen — bewuste keuze (2026-08-16): elk team regelt
 *   zijn eigen hoofdbeheerders zelf, platform_admin hoeft niet als tussenpersoon op te
 *   treden voor elke promotie. Geen guard tegen "laatste hoofdbeheerder degradeert
 *   zichzelf" — bewust simpel gehouden, platform_admin kan dat altijd herstellen.
 * - team_admin ("Beheerder") mag helemaal geen rollen wijzigen (peer protection)
 */
async function changeRole(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const { player_id, team_id, new_role } = body
  if (!player_id || !team_id || !new_role) {
    return json({ error: 'player_id, team_id en new_role zijn verplicht' }, 400)
  }
  if (!['player', 'team_admin', 'team_owner'].includes(new_role as string)) {
    return json({ error: 'Ongeldig role. Kies player, team_admin of team_owner.' }, 400)
  }

  const svc = adminClient()
  const isPlatformAdmin = await isClubAdminForTeam(caller.user.id, team_id as string)

  if (!isPlatformAdmin) {
    const { data: callerMembership } = await svc
      .from('team_memberships')
      .select('role')
      .eq('team_id', team_id)
      .eq('player_id', caller.user.id)
      .eq('active', true)
      .maybeSingle()

    if (callerMembership?.role !== 'team_owner') {
      return json({ error: 'Alleen de hoofdbeheerder of platform-admin kan rollen wijzigen' }, 403)
    }
  }

  const { error } = await svc.from('team_memberships')
    .update({ role: new_role })
    .eq('team_id', team_id)
    .eq('player_id', player_id)

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// ── Toegangscodes ─────────────────────────────────────────────────────────────
//
// Een code is een IDENTIFIER, geen geheim: hij zegt wie je bent, de PIN blijft het
// bewijs dát je het bent. Daarom mogen resolve en activate zonder inlog, en levert
// een geldige code op zichzelf nooit een sessie op.

interface AccessCodeRow {
  id: string
  team_id: string
  code: string
  display_name: string
  jersey_number: number | null
  role: string
  player_id: string | null
  activated_at: string | null
  revoked_at: string | null
  invite_expires_at: string | null
}

/** Haalt de rij op en zegt waarom hij eventueel niet bruikbaar is. */
async function loadAccessCode(code: unknown): Promise<
  { row: AccessCodeRow } | { error: string; status: number }
> {
  if (typeof code !== 'string' || code.trim() === '') {
    return { error: 'Geen code opgegeven', status: 400 }
  }
  // Streepjes en spaties zijn presentatie (ABCDE-FGHJK), geen deel van de code.
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '')

  const svc = adminClient()
  const { data } = await svc
    .from('team_access_codes')
    .select('id, team_id, code, display_name, jersey_number, role, player_id, activated_at, revoked_at, invite_expires_at')
    .eq('code', normalized)
    .maybeSingle()

  // Bewust dezelfde melding voor 'bestaat niet' en 'ingetrokken': anders is dit
  // een orakel waarmee je kunt aftasten welke codes ooit hebben bestaan.
  if (!data) return { error: 'Deze link is niet (meer) geldig', status: 404 }
  const row = data as AccessCodeRow
  if (row.revoked_at) return { error: 'Deze link is niet (meer) geldig', status: 404 }

  // Verlopen geldt alleen voor een uitnodiging die nog niet verzilverd is; een
  // geactiveerde code is een vaste inlogroute en verloopt niet.
  if (!row.activated_at && row.invite_expires_at && new Date(row.invite_expires_at) < new Date()) {
    return { error: 'Deze uitnodiging is verlopen. Vraag je beheerder om een nieuwe link.', status: 410 }
  }
  return { row }
}

/**
 * resolve_access_code — publiek. Code → wie je bent en bij welk team.
 * Geeft NOOIT een lijst van andere spelers terug; dat is precies het lek dat deze
 * hele stap dichtzet.
 */
async function resolveAccessCode(body: Record<string, unknown>) {
  const result = await loadAccessCode(body.code)
  if ('error' in result) return json({ error: result.error }, result.status)
  const row = result.row

  const svc = adminClient()
  const { data: team } = await svc
    .from('teams')
    .select('id, name, clubs(name)')
    .eq('id', row.team_id)
    .single()

  // has_set_pin bepaalt of de speler een PIN moet kiezen of invoeren.
  let hasSetPin = false
  if (row.player_id) {
    const { data: creds } = await svc
      .from('player_credentials')
      .select('has_set_pin')
      .eq('player_id', row.player_id)
      .maybeSingle()
    hasSetPin = creds?.has_set_pin === true
  }

  return json({
    code: row.code,
    display_name: row.display_name,
    team_id: row.team_id,
    team_name: (team as { name?: string } | null)?.name ?? null,
    club_name: (team as { clubs?: { name?: string } } | null)?.clubs?.name ?? null,
    activated: !!row.activated_at,
    player_id: row.player_id,
    has_set_pin: hasSetPin,
  })
}

/**
 * activate_access_code — publiek. Code + gekozen PIN → account, membership, sessie.
 *
 * Alleen voor een code die nog niet geactiveerd is. Een al geactiveerde code valt
 * terug op de gewone PIN-login (set_pin/login), want daar hoort het account al bij
 * iemand en zou activeren een overname zijn.
 */
async function activateAccessCode(body: Record<string, unknown>) {
  const { pin } = body
  const result = await loadAccessCode(body.code)
  if ('error' in result) return json({ error: result.error }, result.status)
  const row = result.row

  if (row.activated_at || row.player_id) {
    return json({ error: 'Deze link is al in gebruik. Log in met je PIN.', already_activated: true }, 409)
  }
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    return json({ error: 'PIN moet 4 tot 6 cijfers bevatten' }, 400)
  }

  const svc = adminClient()
  const provisioned = await provisionPlayer(svc, {
    full_name: row.display_name,
    display_name: row.display_name,
    jersey_number: row.jersey_number ?? undefined,
  })
  if ('error' in provisioned) return json({ error: provisioned.error }, 500)

  const { error: membershipError } = await svc.from('team_memberships').upsert({
    team_id:       row.team_id,
    player_id:     provisioned.playerId,
    role:          row.role,
    display_name:  row.display_name,
    jersey_number: row.jersey_number,
    active:        true,
  }, { onConflict: 'team_id,player_id' })
  if (membershipError) {
    await svc.auth.admin.deleteUser(provisioned.playerId)
    return json({ error: 'Kon lidmaatschap niet aanmaken: ' + membershipError.message }, 500)
  }

  // De code claimen vóór de PIN wordt gezet: als twee mensen dezelfde link tegelijk
  // openen, verliest de tweede hier en niet pas na het kiezen van een PIN.
  const { data: claimed } = await svc
    .from('team_access_codes')
    .update({ player_id: provisioned.playerId, activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('player_id', null)
    .select('id')
    .maybeSingle()
  if (!claimed) {
    await svc.from('team_memberships').delete()
      .eq('team_id', row.team_id).eq('player_id', provisioned.playerId)
    await svc.auth.admin.deleteUser(provisioned.playerId)
    return json({ error: 'Deze link is zojuist al gebruikt. Log in met je PIN.', already_activated: true }, 409)
  }

  const pinHash = await bcrypt.hash(pin, 10)
  const { data: creds, error: credError } = await svc
    .from('player_credentials')
    .update({ pin_hash: pinHash, has_set_pin: true })
    .eq('player_id', provisioned.playerId)
    .select('internal_email, internal_password')
    .single()
  if (credError || !creds) return json({ error: 'Kon PIN niet opslaan' }, 500)

  const { data: session, error: signInError } = await svc.auth.signInWithPassword({
    email:    creds.internal_email,
    password: creds.internal_password,
  })
  if (signInError) return json({ error: signInError.message }, 500)

  return json({ session: session.session, player_id: provisioned.playerId, team_id: row.team_id })
}

/**
 * link_access_code — ingelogd. Koppelt een openstaande code aan je bestaande
 * profiel, zodat je in een tweede team komt zonder tweede account.
 *
 * Dit is de multi-team-route: precies wat "welke Hidde is welke" oplost, want de
 * code hangt aan één rosterplek en niet aan een naam.
 */
async function linkAccessCode(body: Record<string, unknown>, authHeader: string | null) {
  const caller = await resolveCaller(authHeader)
  if (!caller) return json({ error: 'Niet geauthenticeerd' }, 401)

  const result = await loadAccessCode(body.code)
  if ('error' in result) return json({ error: result.error }, result.status)
  const row = result.row

  if (row.player_id && row.player_id !== caller.user.id) {
    return json({ error: 'Deze link hoort bij iemand anders' }, 409)
  }
  if (row.player_id === caller.user.id) {
    return json({ ok: true, team_id: row.team_id, already_linked: true })
  }

  const svc = adminClient()
  const { error: membershipError } = await svc.from('team_memberships').upsert({
    team_id:       row.team_id,
    player_id:     caller.user.id,
    role:          row.role,
    display_name:  row.display_name,
    jersey_number: row.jersey_number,
    active:        true,
  }, { onConflict: 'team_id,player_id' })
  if (membershipError) {
    return json({ error: 'Kon lidmaatschap niet aanmaken: ' + membershipError.message }, 500)
  }

  const { data: claimed } = await svc
    .from('team_access_codes')
    .update({ player_id: caller.user.id, activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('player_id', null)
    .select('id')
    .maybeSingle()
  if (!claimed) return json({ error: 'Deze link is zojuist al gebruikt' }, 409)

  return json({ ok: true, team_id: row.team_id })
}

// ── Router ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok', 200)

  try {
    const body = await req.json() as Record<string, unknown>
    const { action } = body
    const authHeader = req.headers.get('Authorization')

    switch (action) {
      case 'create_player':         return createPlayer(body, authHeader)
      case 'create_team':           return createTeam(body, authHeader)
      case 'get_players_for_login': return getPlayersForLogin(body)
      case 'get_players_status':    return getPlayersStatus(body, authHeader)
      case 'login':                 return login(body)
      case 'set_pin':               return setPin(body)
      case 'reset_pin':             return resetPin(body, authHeader)
      case 'change_pin':            return changePin(body, authHeader)
      case 'change_role':           return changeRole(body, authHeader)
      case 'impersonate':           return impersonate(body, authHeader)
      case 'set_captain':           return setCaptain(body, authHeader)
      case 'resolve_access_code':   return resolveAccessCode(body)
      case 'activate_access_code':  return activateAccessCode(body)
      case 'link_access_code':      return linkAccessCode(body, authHeader)
      default:
        return json({ error: `Onbekende actie: ${action}` }, 400)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return json({ error: message }, 500)
  }
})
