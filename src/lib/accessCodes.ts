import { supabase } from './supabase'
import { getFreshAccessToken } from './auth'

/**
 * Persoonlijke toegangscodes.
 *
 * De code is een IDENTIFIER, geen geheim: hij zegt wie je bent, de PIN blijft het
 * bewijs dát je het bent. Daarom mag hij in een URL staan en in localStorage
 * blijven hangen — precies zoals een gebruikersnaam.
 */

/** Onthouden code, zodat een bekend toestel direct op het PIN-scherm uitkomt. */
const STORAGE_KEY = 'accessCode'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-handler`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface ResolvedCode {
  code: string
  display_name: string
  team_id: string
  team_name: string | null
  club_name: string | null
  activated: boolean
  player_id: string | null
  has_set_pin: boolean
}

/**
 * Streepjes, spaties en kleine letters zijn presentatie, geen inhoud. De server
 * normaliseert ook, maar hier alvast zodat wat we opslaan en tonen consistent is.
 */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** ABCDEFGHJK → ABCDE-FGHJK. Alleen voor weergave en delen. */
export function formatCode(code: string): string {
  const c = normalizeCode(code)
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/i/${normalizeCode(code)}`
}

export function readStoredCode(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? normalizeCode(v) : null
  } catch {
    return null
  }
}

export function storeCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeCode(code))
  } catch {
    // Privémodus of vol geheugen: de code onthouden is een gemak, geen vereiste.
  }
}

export function clearStoredCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // idem
  }
}

async function callPublic<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch {
    return { error: 'Geen verbinding. Controleer je internet en probeer opnieuw.' } as T & { error: string }
  }
}

export async function resolveAccessCode(code: string) {
  return callPublic<ResolvedCode>({ action: 'resolve_access_code', code: normalizeCode(code) })
}

export async function activateAccessCode(code: string, pin: string) {
  return callPublic<{
    session?: { access_token: string; refresh_token: string }
    player_id?: string
    team_id?: string
    already_activated?: boolean
  }>({ action: 'activate_access_code', code: normalizeCode(code), pin })
}

/** Ingelogd: koppelt een openstaande code aan je bestaande profiel (multi-team). */
export async function linkAccessCode(code: string) {
  // Verse token, niet de gecachte uit de sessie — zie de gotcha in CLAUDE.md over
  // achtergrondtabs die de auto-refresh vertragen.
  const token = await getFreshAccessToken()
  if (!token) return { error: 'Niet ingelogd' }

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'link_access_code', code: normalizeCode(code) }),
    })
    return await res.json() as { ok?: boolean; team_id?: string; already_linked?: boolean; error?: string }
  } catch {
    return { error: 'Geen verbinding. Controleer je internet en probeer opnieuw.' }
  }
}

/** Zet de sessie die activate_access_code teruggaf in de client. */
export async function applySession(session: { access_token: string; refresh_token: string }) {
  return supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}
