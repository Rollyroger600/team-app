import { supabase } from './supabase'
import type { AuthError, Session } from '@supabase/supabase-js'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-handler`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

async function callAuthHandler(body: Record<string, unknown>, authToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${authToken ?? ANON_KEY}`,
  }

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? 'Onbekende fout')
  return data
}

export interface LoginPlayer {
  player_id: string
  display_name: string
  jersey_number: number | null
  has_set_pin: boolean
}

export async function getPlayersForLogin(
  teamId: string
): Promise<{ players: LoginPlayer[]; error?: string }> {
  try {
    const data = await callAuthHandler({ action: 'get_players_for_login', team_id: teamId })
    return { players: data.players ?? [] }
  } catch (err) {
    return { players: [], error: (err as Error).message }
  }
}

export async function getPlayersForLoginBySlug(
  clubSlug: string,
  teamSlug: string
): Promise<{ players: LoginPlayer[]; team_id?: string; error?: string }> {
  try {
    const data = await callAuthHandler({
      action: 'get_players_for_login',
      club_slug: clubSlug,
      team_slug: teamSlug,
    })
    return { players: data.players ?? [], team_id: data.team_id }
  } catch (err) {
    return { players: [], error: (err as Error).message }
  }
}

export interface LoginResult {
  session?: Session
  needs_pin_setup?: boolean
  player_id?: string
  error?: string
}

export async function loginWithPin(playerId: string, pin: string): Promise<LoginResult> {
  try {
    const data = await callAuthHandler({ action: 'login', player_id: playerId, pin })
    if (data.needs_pin_setup) return { needs_pin_setup: true, player_id: playerId }
    if (data.session) {
      // Load session into supabase client
      await supabase.auth.setSession(data.session)
      return { session: data.session }
    }
    return { error: 'Geen sessie ontvangen' }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function setupPin(playerId: string, pin: string): Promise<{ session?: Session; error?: string }> {
  try {
    const data = await callAuthHandler({ action: 'set_pin', player_id: playerId, pin })
    if (data.session) {
      await supabase.auth.setSession(data.session)
      return { session: data.session }
    }
    return { error: 'Geen sessie ontvangen' }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function changePin(currentPin: string, newPin: string): Promise<{ ok?: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Niet ingelogd' }
  try {
    await callAuthHandler({ action: 'change_pin', current_pin: currentPin, new_pin: newPin }, session.access_token)
    return { ok: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function resetPlayerPin(playerId: string, teamId: string): Promise<{ ok?: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Niet ingelogd' }
  try {
    await callAuthHandler({ action: 'reset_pin', player_id: playerId, team_id: teamId }, session.access_token)
    return { ok: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function changePlayerRole(
  playerId: string,
  teamId: string,
  newRole: 'player' | 'team_admin'
): Promise<{ ok?: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Niet ingelogd' }
  try {
    await callAuthHandler({ action: 'change_role', player_id: playerId, team_id: teamId, new_role: newRole }, session.access_token)
    return { ok: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function createPlayer(params: {
  team_id: string
  full_name: string
  display_name?: string
  jersey_number?: number | null
  role?: 'player' | 'team_admin'
}): Promise<{ player_id?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Niet ingelogd' }
  try {
    const data = await callAuthHandler({ action: 'create_player', ...params }, session.access_token)
    return { player_id: data.player_id }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
