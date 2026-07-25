import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { PodiumEntry } from './stats'

export interface PotjescupPlayerRow {
  player_id: string
  full_name: string
  totalPoints: number
  sessionsPlayed: number
}

interface RawMembershipRow {
  player_id: string
  profiles: { full_name: string | null } | null
}

interface RawScoreRow {
  player_id: string
  points: number
  session: { team_id: string } | null
}

export function usePotjescupStats(teamId?: string) {
  return useQuery<PotjescupPlayerRow[]>({
    queryKey: ['potjescupStats', teamId],
    queryFn: async (): Promise<PotjescupPlayerRow[]> => {
      const [membershipsRes, scoresRes] = await Promise.all([
        supabase
          .from('team_memberships')
          .select('player_id, profiles(full_name)')
          .eq('team_id', teamId!)
          .eq('active', true),
        supabase
          .from('potjescup_scores')
          .select('player_id, points, session:potjescup_sessions!inner(team_id)')
          .eq('session.team_id', teamId!),
      ])

      const memberships = (membershipsRes.data || []) as unknown as RawMembershipRow[]
      const rawScores = (scoresRes.data || []) as unknown as RawScoreRow[]

      const perPlayer: Record<string, { totalPoints: number; sessionsPlayed: number }> = {}
      for (const s of rawScores) {
        if (!perPlayer[s.player_id]) perPlayer[s.player_id] = { totalPoints: 0, sessionsPlayed: 0 }
        perPlayer[s.player_id].totalPoints += s.points
        if (s.points > 0) perPlayer[s.player_id].sessionsPlayed++
      }

      return memberships
        .map(m => {
          const agg = perPlayer[m.player_id] || { totalPoints: 0, sessionsPlayed: 0 }
          return {
            player_id: m.player_id,
            full_name: m.profiles?.full_name || '?',
            totalPoints: agg.totalPoints,
            sessionsPlayed: agg.sessionsPlayed,
          }
        })
        .sort((a, b) => b.totalPoints - a.totalPoints)
    },
    enabled: !!teamId,
  })
}

export function topByPoints(players: PotjescupPlayerRow[], n = 3): PodiumEntry[] {
  return [...players]
    .filter(p => p.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, n)
    .map(p => ({ name: p.full_name, value: p.totalPoints }))
}
