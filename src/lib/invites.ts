import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { inviteUrl, formatCode } from './accessCodes'

/**
 * Beheer van de persoonlijke toegangscodes vanuit Admin → Spelers.
 *
 * De code zelf wordt nooit hier gemaakt: `team_access_codes.code` heeft
 * `DEFAULT generate_access_code()`, dus een INSERT zonder code krijgt er vanzelf
 * een. Zo bestaat er maar één generator en kan er geen tweede, afwijkende versie
 * in de frontend ontstaan.
 */

export interface AccessCode {
  id: string
  team_id: string
  code: string
  display_name: string
  jersey_number: number | null
  role: 'player' | 'team_admin' | 'team_owner'
  player_id: string | null
  activated_at: string | null
  revoked_at: string | null
  invite_expires_at: string | null
}

export const ACCESS_CODE_SELECT =
  'id, team_id, code, display_name, jersey_number, role, player_id, activated_at, revoked_at, invite_expires_at'

export function useAccessCodes(teamId: string | undefined, enabled = true) {
  return useQuery<AccessCode[]>({
    queryKey: ['accessCodes', teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_access_codes')
        .select(ACCESS_CODE_SELECT)
        .eq('team_id', teamId!)
        .is('revoked_at', null)
        .order('created_at', { ascending: true })
      return (data as unknown as AccessCode[]) || []
    },
    enabled: !!teamId && enabled,
  })
}

export function isPending(c: AccessCode): boolean {
  return !c.activated_at && !c.revoked_at
}

export function isExpired(c: AccessCode): boolean {
  return isPending(c) && !!c.invite_expires_at && new Date(c.invite_expires_at) < new Date()
}

export async function createInvite(
  teamId: string,
  values: { display_name: string; jersey_number: number | null; role: AccessCode['role'] },
  createdBy: string | null,
) {
  // Bewust geen `code` meegegeven — de kolomstandaard vult hem.
  const { data, error } = await supabase
    .from('team_access_codes')
    .insert({
      team_id: teamId,
      display_name: values.display_name,
      jersey_number: values.jersey_number,
      role: values.role,
      created_by: createdBy,
    })
    .select(ACCESS_CODE_SELECT)
    .single()
  return { invite: data as unknown as AccessCode | null, error: error?.message }
}

/** Trekt de code in. De rij blijft staan als auditspoor (created_by, revoked_at). */
export async function revokeInvite(id: string) {
  const { error } = await supabase
    .from('team_access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message }
}

/**
 * Nieuwe code op dezelfde rij: de oude link werkt daarna niet meer. Voor "kwijt"
 * of "per ongeluk in de verkeerde groepsapp geplakt" -- de persoon en zijn
 * lidmaatschap blijven ongemoeid.
 */
export async function regenerateCode(id: string) {
  // De kolomstandaard geldt alleen bij INSERT, dus hier de generator expliciet
  // aanroepen -- niet een eigen implementatie in de frontend erbij verzinnen.
  const { data: fresh, error: rpcError } = await supabase.rpc('generate_access_code')
  if (rpcError || !fresh) {
    return { invite: null, error: rpcError?.message ?? 'Kon geen nieuwe code maken' }
  }

  const { data, error } = await supabase
    .from('team_access_codes')
    .update({ code: fresh as unknown as string })
    .eq('id', id)
    .select(ACCESS_CODE_SELECT)
    .single()
  return { invite: data as unknown as AccessCode | null, error: error?.message }
}

/**
 * Deelt de link via de native deelkaart van het toestel (inclusief WhatsApp), met
 * kopiëren naar het klembord als terugval. Geeft terug wat er gebeurd is, zodat de
 * knop kan bevestigen -- op desktop is er meestal geen deelkaart.
 */
export async function shareInvite(c: AccessCode, teamName: string | null): Promise<'gedeeld' | 'gekopieerd' | 'mislukt'> {
  const url = inviteUrl(c.code)
  const text = `Hoi ${c.display_name}, hier is je persoonlijke link voor ${teamName ?? 'het team'} in de Hockey Team App:\n${url}\n\nCode: ${formatCode(c.code)}`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Hockey Team App', text })
      return 'gedeeld'
    } catch (err) {
      // AbortError = de gebruiker sloot de deelkaart zelf; dat is geen fout en mag
      // niet stilletjes op het klembord eindigen.
      if (err instanceof Error && err.name === 'AbortError') return 'mislukt'
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'gekopieerd'
  } catch {
    return 'mislukt'
  }
}
