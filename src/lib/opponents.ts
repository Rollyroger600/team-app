import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import useTeamStore from '../stores/useTeamStore'

/**
 * Resolves a `matches.opponent` string to the short display name an admin set on
 * the corresponding `league_teams` row.
 *
 * `matches.opponent` is a free-text snapshot taken when the match was created or
 * imported, deliberately not synced to `league_teams` (see CLAUDE.md). That
 * keeps friendlies and one-off fixtures editable, but it means the short names
 * from Admin → Competitie don't reach the match screens on their own. This hook
 * bridges the two at display time, by name, so nothing has to be denormalised.
 *
 * Matches with no league counterpart (friendlies, cup games) simply fall through
 * to their own text — which is the correct result for them.
 */
export function useOpponentName(): (opponent: string | null | undefined) => string {
  const { activeTeam } = useTeamStore()
  const teamId = activeTeam?.id

  const { data: shortNames } = useQuery<Record<string, string>>({
    queryKey: ['opponentShortNames', teamId],
    queryFn: async () => {
      const { data: league } = await supabase
        .from('leagues')
        .select('id')
        .eq('team_id', teamId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!league) return {}

      const { data: teams } = await supabase
        .from('league_teams')
        .select('team_name, short_name')
        .eq('league_id', league.id)

      const map: Record<string, string> = {}
      for (const t of teams || []) {
        if (t.short_name) map[t.team_name] = t.short_name
      }
      return map
    },
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  })

  return useCallback(
    (opponent: string | null | undefined): string => {
      if (!opponent) return ''
      const short = shortNames?.[opponent]
      if (short) return short
      // No short name set for this team yet. Drop the redundant competition
      // suffix ("Bloemendaal (H.C.) Heren 30-1" → "Bloemendaal (H.C.)") so the
      // fallback still fits on a phone. This was already Stats.tsx's local
      // behaviour; it's shared here so every screen reads the same.
      return opponent.replace(/ Heren.*$/, '')
    },
    [shortNames],
  )
}
