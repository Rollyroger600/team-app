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

/**
 * Minimaal aantal trainingen voordat een verlooplijn iets zegt.
 *
 * Staat hier en niet in PotjescupChart.tsx zodat Potjescup.tsx de drempel kan lezen
 * zonder die module te importeren — de grafiek wordt lazy geladen omdat recharts
 * ~100 kB gzip weegt en de meeste bezoeken hem niet nodig hebben.
 */
export const MIN_SESSIONS_FOR_CHART = 3

export interface PotjescupSessionScore {
  player_id: string
  full_name: string
  points: number
}

export interface PotjescupSession {
  id: string
  session_date: string
  /** Alleen spelers die punten pakten, aflopend — de rest scoorde 0 en is ruis in het logboek. */
  scorers: PotjescupSessionScore[]
}

/** Eén punt op de verlooplijn van één speler: het totaal ná die training. */
export interface PotjescupCumulativePoint {
  session_date: string
  total: number
}

export interface PotjescupPlayerSeries {
  player_id: string
  full_name: string
  points: PotjescupCumulativePoint[]
}

export interface PotjescupHistory {
  /** Nieuwste eerst — zo wordt het logboek getoond. */
  sessions: PotjescupSession[]
  /** Cumulatief verloop per speler, oplopend op datum — invoer voor de grafiek. */
  series: PotjescupPlayerSeries[]
}

/** Eindstand van een speler = het laatste punt op de cumulatieve lijn. */
function lastTotal(s: PotjescupPlayerSeries): number {
  return s.points.length === 0 ? 0 : s.points[s.points.length - 1].total
}

interface RawHistoryScore {
  player_id: string
  points: number
  profiles: { full_name: string | null; nickname: string | null } | null
}

interface RawHistorySession {
  id: string
  session_date: string
  scores: RawHistoryScore[]
}

/**
 * Het verloop van de Potjescup over de trainingen heen: per sessie wie er scoorde, en
 * per speler de cumulatieve stand na elke training.
 *
 * Staat naast usePotjescupStats() in dit bestand zodat alle Potjescup-afleidingen op één
 * plek blijven; het is bewust een eigen query, want de ranglijst heeft de sessiedetails
 * niet nodig en wordt op veel meer plekken gelezen.
 */
export function usePotjescupHistory(teamId?: string) {
  return useQuery<PotjescupHistory>({
    queryKey: ['potjescupHistory', teamId],
    queryFn: async (): Promise<PotjescupHistory> => {
      const { data } = await supabase
        .from('potjescup_sessions')
        .select('id, session_date, scores:potjescup_scores(player_id, points, profiles(full_name, nickname))')
        .eq('team_id', teamId!)
        .order('session_date', { ascending: true })

      const raw = (data || []) as unknown as RawHistorySession[]
      const nameOf = (s: RawHistoryScore): string =>
        s.profiles?.nickname || s.profiles?.full_name || '?'

      const sessions: PotjescupSession[] = raw.map(s => ({
        id: s.id,
        session_date: s.session_date,
        scorers: s.scores
          .filter(sc => sc.points > 0)
          .map(sc => ({ player_id: sc.player_id, full_name: nameOf(sc), points: sc.points }))
          .sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name)),
      }))

      // Cumulatief opbouwen over álle sessies, ook die waarin een speler 0 pakte —
      // anders zou een vlakke periode in de grafiek wegvallen in plaats van vlak te lopen.
      const running: Record<string, number> = {}
      const names: Record<string, string> = {}
      const points: Record<string, PotjescupCumulativePoint[]> = {}

      for (const session of raw) {
        for (const sc of session.scores) {
          names[sc.player_id] = nameOf(sc)
          running[sc.player_id] = (running[sc.player_id] || 0) + sc.points
        }
        for (const playerId of Object.keys(running)) {
          if (!points[playerId]) points[playerId] = []
          points[playerId].push({ session_date: session.session_date, total: running[playerId] })
        }
      }

      const series: PotjescupPlayerSeries[] = Object.keys(points)
        .map(playerId => ({
          player_id: playerId,
          full_name: names[playerId] || '?',
          points: points[playerId],
        }))
        .sort((a, b) => lastTotal(b) - lastTotal(a))

      return { sessions: [...sessions].reverse(), series }
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
