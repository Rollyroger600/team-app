import React from 'react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import type { League, LeagueMatch } from '../../types/app'

interface LeagueResultsQueryData {
  league: League | null
  matches: LeagueMatch[]
  teamNames: Record<string, string>
  ownTeamId: string | null
}

function formatMatchDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Datum onbekend'
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

// --- Score row ---
interface ScoreRowProps {
  match: LeagueMatch
  teamNames: Record<string, string>
  ownTeamId: string | null
  onSave: (id: string, scoreHome: number, scoreAway: number) => void
}

function ScoreRow({ match, teamNames, ownTeamId, onSave }: ScoreRowProps): React.JSX.Element {
  const [home, setHome] = useState<string | number>(match.score_home ?? '')
  const [away, setAway] = useState<string | number>(match.score_away ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const homeName = (match.home_team_id ? teamNames[match.home_team_id] : undefined) ?? '—'
  const awayName = (match.away_team_id ? teamNames[match.away_team_id] : undefined) ?? '—'
  const isOwnHome = match.home_team_id === ownTeamId
  const isOwnAway = match.away_team_id === ownTeamId

  const hasScore = home !== '' && away !== ''
  const isDirty =
    String(home) !== String(match.score_home ?? '') ||
    String(away) !== String(match.score_away ?? '')

  async function handleSave(): Promise<void> {
    if (!hasScore) return
    setSaving(true)
    const { error } = await supabase
      .from('league_matches')
      .update({
        score_home: parseInt(String(home), 10),
        score_away: parseInt(String(away), 10),
        status: 'completed',
      })
      .eq('id', match.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave(match.id, parseInt(String(home), 10), parseInt(String(away), 10))
    }
  }

  return (
    <div className="grid items-center gap-2 py-2.5 px-3" style={{ gridTemplateColumns: '1fr auto auto auto 1fr auto' }}>
      <span
        className={`text-sm truncate text-right ${isOwnHome ? 'font-semibold text-amber-400' : ''}`}
        style={!isOwnHome ? { color: 'var(--color-text)' } : {}}
      >
        {homeName}
      </span>

      <input
        type="number"
        min="0"
        max="99"
        value={home}
        onChange={(e) => { setHome(e.target.value); setSaved(false) }}
        className="w-10 text-center rounded-lg border py-1.5 text-sm font-bold outline-none focus:border-amber-400 bg-surface-2 border-border text-text"
      />

      <span className="text-slate-500 text-sm font-bold">–</span>

      <input
        type="number"
        min="0"
        max="99"
        value={away}
        onChange={(e) => { setAway(e.target.value); setSaved(false) }}
        className="w-10 text-center rounded-lg border py-1.5 text-sm font-bold outline-none focus:border-amber-400 bg-surface-2 border-border text-text"
      />

      <span
        className={`text-sm truncate ${isOwnAway ? 'font-semibold text-amber-400' : ''}`}
        style={!isOwnAway ? { color: 'var(--color-text)' } : {}}
      >
        {awayName}
      </span>

      <button
        onClick={handleSave}
        disabled={!hasScore || !isDirty || saving}
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-20"
        style={{
          backgroundColor: saved ? 'rgb(34 197 94 / 0.2)' : isDirty && hasScore ? 'var(--color-secondary)' : 'transparent',
        }}
      >
        <Check size={13} color={saved ? '#22c55e' : '#0f172a'} strokeWidth={3} />
      </button>
    </div>
  )
}

// --- Matchday group ---
interface MatchdayGroupProps {
  matchday: number
  matches: LeagueMatch[]
  teamNames: Record<string, string>
  ownTeamId: string | null
  onSave: (id: string, scoreHome: number, scoreAway: number) => void
}

function MatchdayGroup({ matchday, matches, teamNames, ownTeamId, onSave }: MatchdayGroupProps): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const completed = matches.filter((m) => m.score_home !== null && m.score_away !== null).length

  return (
    <div className="rounded-xl border overflow-hidden bg-surface border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Speelronde {matchday}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${completed === matches.length ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
            {completed}/{matches.length}
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>

      {open && (
        <div className="divide-y divide-border">
          {matches.map((m) => (
            <ScoreRow
              key={m.id}
              match={m}
              teamNames={teamNames}
              ownTeamId={ownTeamId}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main ---
export default function AdminLeagueResults(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const teamId = activeTeam?.id
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<LeagueResultsQueryData>({
    queryKey: ['adminLeagueResults', teamId],
    queryFn: async (): Promise<LeagueResultsQueryData> => {
      const { data: lg } = await supabase
        .from('leagues')
        .select('*')
        .eq('team_id', teamId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lg) return { league: null, matches: [], teamNames: {}, ownTeamId: null }

      const [{ data: lt }, { data: lm }] = await Promise.all([
        supabase.from('league_teams').select('id, team_name, is_own_team').eq('league_id', lg.id),
        supabase.from('league_matches').select('*').eq('league_id', lg.id).order('matchday').order('match_date'),
      ])

      const names: Record<string, string> = {}
      let own: string | null = null
      for (const t of (lt as { id: string; team_name: string; is_own_team: boolean }[] | null) || []) {
        names[t.id] = t.team_name
        if (t.is_own_team) own = t.id
      }

      return {
        league: lg as League,
        matches: (lm as LeagueMatch[]) || [],
        teamNames: names,
        ownTeamId: own,
      }
    },
    enabled: !!teamId,
  })

  const league = data?.league || null
  const matches = data?.matches || []
  const teamNames = data?.teamNames || {}
  const ownTeamId = data?.ownTeamId || null

  const handleSave = useCallback((id: string, scoreHome: number, scoreAway: number) => {
    queryClient.setQueryData(['adminLeagueResults', teamId], (old: LeagueResultsQueryData | undefined) => {
      if (!old) return old
      return {
        ...old,
        matches: old.matches.map((m) =>
          m.id === id ? { ...m, score_home: scoreHome, score_away: scoreAway, status: 'completed' } : m
        ),
      }
    })
  }, [queryClient, teamId])

  // Group by matchday
  const grouped: Record<number, LeagueMatch[]> = {}
  for (const m of matches) {
    const key = m.matchday ?? 0
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  }
  const sortedMatchdays = Object.keys(grouped).map(Number).sort((a, b) => a - b)

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="opacity-50"><ArrowLeft size={20} /></Link>
          <div className="h-7 w-48 rounded-lg bg-slate-700 animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-800 animate-pulse" />)}
      </div>
    )
  }

  if (!league) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="text-slate-400 hover:text-slate-200"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold">Uitslagen invoeren</h1>
        </div>
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <p className="text-slate-400">Geen competitie gevonden. Maak eerst een competitie aan.</p>
          <Link to="/admin/league" className="mt-3 inline-block text-sm text-amber-400 underline">Naar competitie</Link>
        </div>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="text-slate-400 hover:text-slate-200"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold">Uitslagen invoeren</h1>
        </div>
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <Trophy size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium mb-1">Nog geen wedstrijden</p>
          <p className="text-sm text-slate-400 mb-4">Voer eerst het wedstrijdprogramma in.</p>
          <Link to="/admin/league/matches" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-secondary-text">
            Wedstrijden invoeren
          </Link>
        </div>
      </div>
    )
  }

  const totalCompleted = matches.filter((m) => m.score_home !== null && m.score_away !== null).length

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin/league" className="text-slate-400 hover:text-slate-200"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">Uitslagen invoeren</h1>
          <p className="text-xs text-slate-400">{league.name} · {league.season}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl border p-4 bg-surface border-border">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-text-muted">Ingevoerd</span>
          <span className="font-medium">{totalCompleted} / {matches.length}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700">
          <div
            className="h-1.5 rounded-full bg-amber-400 transition-all"
            style={{ width: `${matches.length ? (totalCompleted / matches.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Matchdays */}
      {sortedMatchdays.map((md) => (
        <MatchdayGroup
          key={md}
          matchday={md}
          matches={grouped[md]}
          teamNames={teamNames}
          ownTeamId={ownTeamId}
          onSave={handleSave}
        />
      ))}

      <p className="text-xs text-center text-slate-500 pt-2">
        Klik op ✓ na het invullen van een score om op te slaan
      </p>
    </div>
  )
}
