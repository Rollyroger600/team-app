/**
 * Shared test helpers: create disposable qa-team players via the real
 * auth-handler edge function, so destructive tests (PIN setup, lockout)
 * never reuse fixed fixture accounts across runs.
 */
import type { APIRequestContext } from '@playwright/test'

const EDGE_URL = `${process.env.SUPABASE_URL}/functions/v1/auth-handler`
const ANON_KEY = process.env.SUPABASE_ANON_KEY!

async function callAuthHandler(
  request: APIRequestContext,
  body: Record<string, unknown>,
  token?: string
) {
  const res = await request.post(EDGE_URL, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
    },
    data: body,
  })
  return res.json()
}

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  const data = await callAuthHandler(request, {
    action: 'login',
    player_id: process.env.QA_TEAM_ADMIN_ID,
    pin: process.env.QA_TEAM_ADMIN_PIN,
  })
  if (!data.session?.access_token) {
    throw new Error('Kon geen admin sessie ophalen voor test-setup: ' + JSON.stringify(data))
  }
  return data.session.access_token
}

export async function createDisposablePlayer(
  request: APIRequestContext,
  namePrefix: string
): Promise<{ player_id: string; display_name: string }> {
  const token = await getAdminToken(request)
  const display_name = `${namePrefix} ${Date.now()}`
  const data = await callAuthHandler(
    request,
    {
      action: 'create_player',
      team_id: process.env.QA_TEAM_ID,
      full_name: display_name,
      display_name,
      role: 'player',
    },
    token
  )
  if (!data.player_id) {
    throw new Error('Kon geen disposable test-speler aanmaken: ' + JSON.stringify(data))
  }
  return { player_id: data.player_id, display_name }
}
