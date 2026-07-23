import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface MatchRef {
  id: string
  opponent: string
  match_date: string
  is_home: boolean
  score_home: number | null
  score_away: number | null
}

export interface GoalMatchBreakdown {
  match: MatchRef
  fieldGoals: number
  cornerGoals: number
  penaltyGoals: number
  goals: number
  assists: number
}

export interface PlayerStatRow {
  player_id: string
  full_name: string
  matches_played: number
  fieldGoals: number
  cornerGoals: number
  penaltyGoals: number
  goals: number
  assists: number
}

export interface TeamStatsData {
  players: PlayerStatRow[]
  goalMap: Record<string, GoalMatchBreakdown[]>
  totalGoals: number
  totalCornerGoals: number
}

interface RawGoalRow {
  scorer_id: string | null
  assist_id: string | null
  is_own_goal: boolean
  is_penalty: boolean
  is_penalty_corner: boolean
  match: MatchRef | null
}

interface RawViewRow {
  player_id: string
  full_name: string
  matches_played: number | null
}

export function useTeamStats(teamId?: string) {
  return useQuery<TeamStatsData>({
    queryKey: ['teamStats', teamId],
    queryFn: async (): Promise<TeamStatsData> => {
      const [viewRes, goalsRes] = await Promise.all([
        supabase
          .from('v_player_stats')
          .select('player_id, full_name, matches_played')
          .eq('team_id', teamId!),
        supabase
          .from('goals')
          .select('scorer_id, assist_id, is_own_goal, is_penalty, is_penalty_corner, match:matches!goals_match_id_fkey(id, opponent, match_date, is_home, score_home, score_away)')
          .eq('matches.team_id', teamId!)
          .not('match', 'is', null),
      ])

      const viewRows = (viewRes.data || []) as unknown as RawViewRow[]
      const rawGoals = (goalsRes.data || []) as unknown as RawGoalRow[]

      let totalGoals = 0
      let totalCornerGoals = 0

      type PlayerAgg = { fieldGoals: number; cornerGoals: number; penaltyGoals: number; assists: number }
      const perPlayer: Record<string, PlayerAgg> = {}
      const perMatch: Record<string, Record<string, GoalMatchBreakdown>> = {}

      const ensurePlayer = (pid: string): PlayerAgg => {
        if (!perPlayer[pid]) perPlayer[pid] = { fieldGoals: 0, cornerGoals: 0, penaltyGoals: 0, assists: 0 }
        return perPlayer[pid]
      }
      const ensureMatch = (pid: string, match: MatchRef | null): GoalMatchBreakdown | null => {
        if (!match) return null
        if (!perMatch[pid]) perMatch[pid] = {}
        if (!perMatch[pid][match.id]) {
          perMatch[pid][match.id] = { match, fieldGoals: 0, cornerGoals: 0, penaltyGoals: 0, goals: 0, assists: 0 }
        }
        return perMatch[pid][match.id]
      }

      for (const g of rawGoals) {
        if (!g.is_own_goal) {
          totalGoals++
          if (g.is_penalty_corner) totalCornerGoals++
        }

        if (!g.is_own_goal && g.scorer_id) {
          const p = ensurePlayer(g.scorer_id)
          const m = ensureMatch(g.scorer_id, g.match)
          if (g.is_penalty_corner) { p.cornerGoals++; if (m) m.cornerGoals++ }
          else if (g.is_penalty) { p.penaltyGoals++; if (m) m.penaltyGoals++ }
          else { p.fieldGoals++; if (m) m.fieldGoals++ }
          if (m) m.goals++
        }

        if (g.assist_id) {
          ensurePlayer(g.assist_id).assists++
          const m = ensureMatch(g.assist_id, g.match)
          if (m) m.assists++
        }
      }

      const players: PlayerStatRow[] = viewRows
        .map(v => {
          const p = perPlayer[v.player_id] || { fieldGoals: 0, cornerGoals: 0, penaltyGoals: 0, assists: 0 }
          return {
            player_id: v.player_id,
            full_name: v.full_name,
            matches_played: v.matches_played ?? 0,
            fieldGoals: p.fieldGoals,
            cornerGoals: p.cornerGoals,
            penaltyGoals: p.penaltyGoals,
            goals: p.fieldGoals + p.cornerGoals + p.penaltyGoals,
            assists: p.assists,
          }
        })
        .sort((a, b) => b.goals - a.goals)

      const goalMap: Record<string, GoalMatchBreakdown[]> = {}
      for (const [pid, matches] of Object.entries(perMatch)) {
        goalMap[pid] = Object.values(matches).sort(
          (a, b) => new Date(a.match.match_date).getTime() - new Date(b.match.match_date).getTime()
        )
      }

      return { players, goalMap, totalGoals, totalCornerGoals }
    },
    enabled: !!teamId,
  })
}

export interface PodiumEntry {
  name: string
  value: number
}

export function topByGoals(players: PlayerStatRow[], n = 3): PodiumEntry[] {
  return [...players]
    .filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, n)
    .map(p => ({ name: p.full_name, value: p.goals }))
}

export function topByGoalsPlusAssists(players: PlayerStatRow[], n = 3): PodiumEntry[] {
  return [...players]
    .filter(p => p.goals + p.assists > 0)
    .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
    .slice(0, n)
    .map(p => ({ name: p.full_name, value: p.goals + p.assists }))
}
