import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Calendar, PlusCircle, ChevronDown, ChevronUp, Target, Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'
import useAuthStore from '../stores/useAuthStore'
import { leagueTeamDisplayName } from '../lib/utils'
import { useOpponentName } from '../lib/opponents'
import React from 'react'

interface TabDef {
  key: string
  label: string
}

const TABS: TabDef[] = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'programma', label: 'Programma' },
  { key: 'uitslagen', label: 'Uitslagen' },
]

function formatMatchDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return 'n.n.b.'
  return timeStr.slice(0, 5)
}

function capitalize(str: string | null | undefined): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

interface LeagueTeamRef {
  id: string
  team_name: string
  short_name: string | null
  is_own_team: boolean
}

interface LeagueMatchRow {
  id: string
  match_date: string
  match_time: string | null
  home_team_id: string
  away_team_id: string
  score_home: number | null
  score_away: number | null
  matchday: number | null
  home_team: LeagueTeamRef | null
  away_team: LeagueTeamRef | null
}

interface GoalRow {
  id: string
  match_id: string
  minute: number | null
  is_own_goal: boolean
  is_penalty: boolean
  is_penalty_corner: boolean
  scorer_id: string | null
  assist_id: string | null
  scorer: { full_name: string | null; nickname: string | null } | null
  assist: { full_name: string | null; nickname: string | null } | null
}

interface MemberRow {
  player_id: string
  profiles: { full_name: string | null; nickname: string | null } | null
}

interface LeagueTeamFull {
  id: string
  team_name: string
  short_name: string | null
  is_own_team: boolean
  registry_id: string | null
  clubs_registry: { logo_url: string | null } | null
}

interface LeagueData {
  id: string
  name: string
  season: string | null
  team_id: string
}

/**
 * A row from `matches` — the team's own fixture list. Deliberately a different
 * shape from `LeagueMatchRow`: a league match is two `league_teams` references,
 * an own match is one free-text `opponent` plus an `is_home` flag. Own matches
 * exist without a league counterpart (friendlies, cup games), which is exactly
 * why the "Eigen team" view has to read from here and not from `league_matches`.
 */
interface OwnMatchRow {
  id: string
  match_date: string
  match_time: string | null
  opponent: string | null
  is_home: boolean | null
  score_home: number | null
  score_away: number | null
  league_match_id: string | null
}

interface MatchesQueryData {
  league: LeagueData | null
  leagueTeams: LeagueTeamFull[]
  matches: LeagueMatchRow[]
  ownMatches: OwnMatchRow[]
  ownMatchMap: Record<string, string>
  goalsMap: Record<string, GoalRow[]>
  teamMembers: MemberRow[]
  logoMap: Record<string, string>
}

function displayNameProfile(profile: { full_name: string | null; nickname: string | null } | null | undefined): string {
  return profile?.nickname || profile?.full_name?.split(' ')[0] || '?'
}

/** Goals for the team's own matches, grouped by `match_id`. */
async function loadGoalsMap(matchIds: string[]): Promise<Record<string, GoalRow[]>> {
  const goalsMap: Record<string, GoalRow[]> = {}
  if (matchIds.length === 0) return goalsMap

  const { data } = await supabase
    .from('goals')
    .select('id, match_id, minute, is_own_goal, is_penalty, scorer_id, assist_id, scorer:profiles!goals_scorer_id_fkey(full_name, nickname), assist:profiles!goals_assist_id_fkey(full_name, nickname)')
    .in('match_id', matchIds)
    .order('minute', { ascending: true, nullsFirst: false })

  for (const g of (data || []) as unknown as GoalRow[]) {
    if (!goalsMap[g.match_id]) goalsMap[g.match_id] = []
    goalsMap[g.match_id].push(g)
  }
  return goalsMap
}

interface TeamNameProps {
  team: LeagueTeamRef | null | undefined
}

function TeamName({ team }: TeamNameProps) {
  if (!team) return <span className="text-text-muted">?</span>
  const name = leagueTeamDisplayName(team)
  if (team.is_own_team) {
    return <span className="text-secondary-soft font-semibold">{name}</span>
  }
  return <span>{name}</span>
}

interface TeamLogoProps {
  url: string | undefined
  name: string | null | undefined
}

function TeamLogo({ url, name }: TeamLogoProps) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={name || ''}
      className="rounded-full object-contain flex-shrink-0 bg-surface"
      style={{ width: 22, height: 22 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// --- Inline goal section for own matches ---
interface GoalSectionProps {
  matchId: string
  goals: GoalRow[]
  members: MemberRow[]
  isAdmin: boolean
  maxGoals: number | null
}

interface GoalForm {
  scorer_id: string
  assist_id: string
  minute: string
  is_own_goal: boolean
  is_penalty: boolean
  is_penalty_corner: boolean
}

function GoalSection({ matchId, goals: initialGoals, members, isAdmin, maxGoals }: GoalSectionProps) {
  const [open, setOpen] = useState(false)
  const [goals, setGoals] = useState<GoalRow[]>(initialGoals)
  const [form, setForm] = useState<GoalForm>({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false, is_penalty_corner: false })
  const [saving, setSaving] = useState(false)

  // Keep in sync if parent reloads
  useEffect(() => { setGoals(initialGoals) }, [initialGoals])

  const atMax = maxGoals != null && goals.length >= maxGoals

  async function addGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.scorer_id && !form.is_own_goal) return
    setSaving(true)
    const { data } = await supabase
      .from('goals')
      .insert({
        match_id: matchId,
        scorer_id: form.scorer_id || null,
        assist_id: form.assist_id || null,
        minute: form.minute ? parseInt(form.minute) : null,
        is_own_goal: form.is_own_goal,
        is_penalty: form.is_penalty,
        is_penalty_corner: form.is_penalty_corner,
      })
      .select('id, match_id, minute, is_own_goal, is_penalty, is_penalty_corner, scorer_id, assist_id, scorer:profiles!goals_scorer_id_fkey(full_name, nickname), assist:profiles!goals_assist_id_fkey(full_name, nickname)')
      .single()
    if (data) setGoals(prev => [...prev, data as unknown as GoalRow].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999)))
    setForm({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false, is_penalty_corner: false })
    setSaving(false)
  }

  async function deleteGoal(goalId: string) {
    await supabase.from('goals').delete().eq('id', goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const inputStyle = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors text-text-muted"
      >
        <span className="flex items-center gap-1.5">
          <Target size={12} />
          {maxGoals != null
            ? <span style={{ color: goals.length < maxGoals ? 'var(--color-unavailable)' : 'var(--color-available)' }}>
                {goals.length}/{maxGoals} doelpunten ingevoerd
              </span>
            : goals.length > 0
              ? `${goals.length} doelpunt${goals.length !== 1 ? 'en' : ''}`
              : isAdmin ? 'Doelpunten invoeren' : 'Geen doelpunten geregistreerd'
          }
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {goals.length > 0 && (
            <div className="space-y-1">
              {goals.map(g => (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="w-7 text-right flex-shrink-0 text-text-muted">
                    {g.minute ? `${g.minute}'` : '–'}
                  </span>
                  <span className="flex-1">
                    {g.is_own_goal ? `${displayNameProfile(g.scorer)} (eigen doel)` : displayNameProfile(g.scorer)}
                    {g.assist?.full_name && (
                      <span className="ml-1.5 text-text-muted">assist: {displayNameProfile(g.assist)}</span>
                    )}
                    {g.is_penalty && <span className="text-secondary-soft ml-1.5">strafbal</span>}
                    {g.is_penalty_corner && <span className="text-info ml-1.5">strafcorner</span>}
                  </span>
                  {isAdmin && (
                    <button onClick={() => deleteGoal(g.id)} className="text-text-faint hover:text-danger transition-colors p-0.5 flex-shrink-0">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <form onSubmit={addGoal} className="space-y-1.5 pt-1 border-t border-border">
              <div className="flex gap-1.5 pt-1.5">
                <select
                  value={form.scorer_id}
                  onChange={e => setForm(p => ({ ...p, scorer_id: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="">Schutter...</option>
                  {members.map(m => (
                    <option key={m.player_id} value={m.player_id}>{displayNameProfile(m.profiles)}</option>
                  ))}
                </select>
                <input
                  type="number" min="1" max="90"
                  value={form.minute}
                  onChange={e => setForm(p => ({ ...p, minute: e.target.value }))}
                  placeholder="Min"
                  className="w-14 px-2 py-1.5 rounded-lg text-xs outline-none text-center"
                  style={inputStyle}
                />
              </div>
              <select
                value={form.assist_id}
                onChange={e => setForm(p => ({ ...p, assist_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={inputStyle}
              >
                <option value="">Assist (optioneel)...</option>
                {members.map(m => (
                  <option key={m.player_id} value={m.player_id}>{displayNameProfile(m.profiles)}</option>
                ))}
              </select>
              <div className="flex gap-3 text-xs flex-wrap">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_own_goal}
                    onChange={e => setForm(p => ({ ...p, is_own_goal: e.target.checked }))}
                    className="accent-amber-400" />
                  Eigen doel
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_penalty}
                    onChange={e => setForm(p => ({ ...p, is_penalty: e.target.checked }))}
                    className="accent-amber-400" />
                  Strafbal
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_penalty_corner}
                    onChange={e => setForm(p => ({ ...p, is_penalty_corner: e.target.checked }))}
                    className="accent-amber-400" />
                  Strafcorner
                </label>
              </div>
              {atMax ? (
                <p className="text-xs text-center py-1 text-available">
                  Alle {maxGoals} doelpunten ingevoerd ✓
                </p>
              ) : (
                <button
                  type="submit"
                  disabled={saving || (!form.scorer_id && !form.is_own_goal)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 bg-secondary text-secondary-text"
                >
                  <Plus size={12} />
                  {saving ? 'Opslaan...' : maxGoals != null ? `Doelpunt toevoegen (${goals.length}/${maxGoals})` : 'Doelpunt toevoegen'}
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// --- Match card for programma/overzicht ---
interface MatchCardProps {
  match: LeagueMatchRow
  logoMap?: Record<string, string>
}

function MatchCard({ match, logoMap = {} }: MatchCardProps) {
  const isPlayed = match.score_home !== null && match.score_away !== null
  const homeIsOwn = match.home_team?.is_own_team
  const awayIsOwn = match.away_team?.is_own_team

  let homeStyle: React.CSSProperties = {}
  let awayStyle: React.CSSProperties = {}
  if (isPlayed && !homeIsOwn && !awayIsOwn) {
    if ((match.score_home ?? 0) > (match.score_away ?? 0)) homeStyle = { color: 'var(--color-text)' }
    else if ((match.score_away ?? 0) > (match.score_home ?? 0)) awayStyle = { color: 'var(--color-text)' }
  }

  return (
    <div className="rounded-xl px-3 py-3 border bg-surface-2 border-border">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center justify-end gap-1.5 text-sm" style={homeIsOwn ? {} : homeStyle}>
          <TeamName team={match.home_team} />
          <TeamLogo url={logoMap[match.home_team?.id || '']} name={leagueTeamDisplayName(match.home_team)} />
        </div>
        <div className="flex-shrink-0 w-16 text-center">
          {isPlayed ? (
            <span className="font-bold text-base text-text">
              {match.score_home}–{match.score_away}
            </span>
          ) : (
            <span className="text-sm font-medium text-text-muted">
              {formatTime(match.match_time)}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1.5 text-sm" style={awayIsOwn ? {} : awayStyle}>
          <TeamLogo url={logoMap[match.away_team?.id || '']} name={leagueTeamDisplayName(match.away_team)} />
          <TeamName team={match.away_team} />
        </div>
      </div>
      {match.matchday && (
        <p className="text-center text-xs mt-1 text-text-muted">
          Speelronde {match.matchday}
        </p>
      )}
    </div>
  )
}

// --- Result card for uitslagen tab (includes goal section for own matches) ---
interface ResultCardProps {
  match: LeagueMatchRow
  matchId?: string
  goals?: GoalRow[]
  members: MemberRow[]
  isAdmin: boolean
  logoMap?: Record<string, string>
}

function ResultCard({ match, matchId, goals, members, isAdmin, logoMap = {} }: ResultCardProps) {
  const homeIsOwn = match.home_team?.is_own_team
  const awayIsOwn = match.away_team?.is_own_team
  const isOwnMatch = homeIsOwn || awayIsOwn

  // Score van ons team
  const ourScore = isOwnMatch
    ? (homeIsOwn ? match.score_home : match.score_away)
    : null
  const goalsCount = (goals || []).length
  const incomplete = isAdmin && isOwnMatch && matchId && ourScore != null && ourScore > 0 && goalsCount < ourScore

  return (
    <div
      className="rounded-xl border overflow-hidden bg-surface-2"
      style={{
        borderColor: incomplete ? 'var(--color-unavailable)' : 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="flex-1 flex items-center justify-end gap-1.5 text-sm">
          <TeamName team={match.home_team} />
          <TeamLogo url={logoMap[match.home_team?.id || '']} name={leagueTeamDisplayName(match.home_team)} />
        </div>
        <div className="flex-shrink-0 w-16 text-center">
          <span className="font-bold text-base text-text">
            {match.score_home}–{match.score_away}
          </span>
        </div>
        <div className="flex-1 flex items-center gap-1.5 text-sm">
          <TeamLogo url={logoMap[match.away_team?.id || '']} name={leagueTeamDisplayName(match.away_team)} />
          <TeamName team={match.away_team} />
        </div>
      </div>
      {match.matchday && (
        <p className="text-center text-xs pb-2 text-text-muted">
          Speelronde {match.matchday}
        </p>
      )}
      {isOwnMatch && matchId && (
        <GoalSection
          matchId={matchId}
          goals={goals || []}
          members={members}
          isAdmin={isAdmin}
          maxGoals={ourScore ?? null}
        />
      )}
    </div>
  )
}

// --- Own-team cards, fed from `matches` instead of `league_matches` ---
// A friendly has no league counterpart, so there are no two `league_teams` rows
// to render: one side is always us, the other is the free-text `opponent`
// resolved through useOpponentName().

interface OwnSide {
  name: string
  logo?: string
}

/** Puts us and the opponent on the right sides of the card. */
function ownSides(match: OwnMatchRow, ownName: string, ownLogo: string | undefined, opponentName: string, opponentLogo: string | undefined): { home: OwnSide; away: OwnSide } {
  const us: OwnSide = { name: ownName, logo: ownLogo }
  const them: OwnSide = { name: opponentName, logo: opponentLogo }
  return match.is_home ? { home: us, away: them } : { home: them, away: us }
}

interface OwnMatchCardProps {
  match: OwnMatchRow
  ownName: string
  ownLogo?: string
  opponentName: string
  opponentLogo?: string
  resultMode?: boolean
  goals?: GoalRow[]
  members?: MemberRow[]
  isAdmin?: boolean
}

function OwnMatchCard({ match, ownName, ownLogo, opponentName, opponentLogo, resultMode, goals, members = [], isAdmin = false }: OwnMatchCardProps) {
  const { home, away } = ownSides(match, ownName, ownLogo, opponentName, opponentLogo)
  const isPlayed = match.score_home !== null && match.score_away !== null

  // Our score is whichever side we were on.
  const ourScore = match.is_home ? match.score_home : match.score_away
  const goalsCount = (goals || []).length
  const incomplete = isAdmin && resultMode && ourScore != null && ourScore > 0 && goalsCount < ourScore

  return (
    <div
      className="rounded-xl border overflow-hidden bg-surface-2"
      style={{ borderColor: incomplete ? 'var(--color-unavailable)' : 'var(--color-border)' }}
    >
      <Link to={`/matches/${match.id}`} className="block px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center justify-end gap-1.5 text-sm">
            <span className="truncate">{home.name}</span>
            <TeamLogo url={home.logo} name={home.name} />
          </div>
          <div className="flex-shrink-0 w-16 text-center">
            {isPlayed ? (
              <span className="font-bold text-base text-text">
                {match.score_home}–{match.score_away}
              </span>
            ) : (
              <span className="text-sm font-medium text-text-muted">
                {formatTime(match.match_time)}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center gap-1.5 text-sm">
            <TeamLogo url={away.logo} name={away.name} />
            <span className="truncate">{away.name}</span>
          </div>
        </div>
        {!match.league_match_id && (
          // Not necessarily a friendly — a cup game has no league counterpart
          // either. "Losse" matches the existing wording for standalone umpire
          // duties, so it stays neutral about which kind it is.
          <p className="text-center text-xs mt-1 text-text-muted">Losse wedstrijd</p>
        )}
      </Link>
      {resultMode && (
        <GoalSection
          matchId={match.id}
          goals={goals || []}
          members={members}
          isAdmin={isAdmin}
          maxGoals={ourScore ?? null}
        />
      )}
    </div>
  )
}

interface OwnMatchGroupProps {
  dateStr: string
  matches: OwnMatchRow[]
  ownName: string
  ownLogo?: string
  resolveOpponent: (opponent: string | null | undefined) => string
  opponentLogo: (opponent: string | null | undefined) => string | undefined
  resultMode?: boolean
  goalsMap?: Record<string, GoalRow[]>
  teamMembers?: MemberRow[]
  isAdmin?: boolean
}

function OwnMatchGroup({ dateStr, matches, ownName, ownLogo, resolveOpponent, opponentLogo, resultMode, goalsMap = {}, teamMembers = [], isAdmin = false }: OwnMatchGroupProps) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-2 mt-5 first:mt-0 text-text-muted">
        {capitalize(formatMatchDate(dateStr))}
      </p>
      <div className="space-y-2">
        {matches.map((m) => (
          <OwnMatchCard
            key={m.id}
            match={m}
            ownName={ownName}
            ownLogo={ownLogo}
            opponentName={resolveOpponent(m.opponent)}
            opponentLogo={opponentLogo(m.opponent)}
            resultMode={resultMode}
            goals={goalsMap[m.id] || []}
            members={teamMembers}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  )
}

interface MatchGroupProps {
  dateStr: string
  matches: LeagueMatchRow[]
  resultMode?: boolean
  ownMatchMap?: Record<string, string>
  goalsMap?: Record<string, GoalRow[]>
  teamMembers?: MemberRow[]
  isAdmin?: boolean
  logoMap?: Record<string, string>
}

function MatchGroup({ dateStr, matches, resultMode, ownMatchMap = {}, goalsMap = {}, teamMembers = [], isAdmin = false, logoMap = {} }: MatchGroupProps) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-2 mt-5 first:mt-0 text-text-muted">
        {capitalize(formatMatchDate(dateStr))}
      </p>
      <div className="space-y-2">
        {matches.map((m) =>
          resultMode ? (
            <ResultCard
              key={m.id}
              match={m}
              matchId={ownMatchMap[m.id]}
              goals={goalsMap[ownMatchMap[m.id]] || []}
              members={teamMembers}
              isAdmin={isAdmin}
              logoMap={logoMap}
            />
          ) : (
            <MatchCard
              key={m.id}
              match={m}
              logoMap={logoMap}
            />
          )
        )}
      </div>
    </div>
  )
}

interface FilterToggleProps {
  ownOnly: boolean
  onChange: (val: boolean) => void
}

function FilterToggle({ ownOnly, onChange }: FilterToggleProps) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-border">
      <button
        onClick={() => onChange(true)}
        className="flex-1 py-2 text-sm font-medium transition-colors"
        style={{ backgroundColor: ownOnly ? 'var(--color-secondary)' : 'var(--color-surface)', color: ownOnly ? 'var(--color-secondary-text)' : 'var(--color-text-muted)' }}
      >
        Eigen team
      </button>
      <button
        onClick={() => onChange(false)}
        className="flex-1 py-2 text-sm font-medium transition-colors"
        style={{ backgroundColor: !ownOnly ? 'var(--color-secondary)' : 'var(--color-surface)', color: !ownOnly ? 'var(--color-secondary-text)' : 'var(--color-text-muted)' }}
      >
        Hele poule
      </button>
    </div>
  )
}

interface EmptyMatchesProps {
  label: string
  icon?: 'calendar' | 'trophy'
  isAdmin?: boolean
}

function EmptyMatches({ label, icon = 'calendar', isAdmin = false }: EmptyMatchesProps) {
  const Icon = icon === 'trophy' ? Trophy : Calendar
  return (
    <div className="rounded-xl p-6 border text-center mt-2 bg-surface border-border">
      <Icon size={32} className="mx-auto mb-2 text-text-faint" />
      <p className="text-sm text-text-muted">{label}</p>
      {isAdmin && (
        <Link
          to="/admin/matches/new"
          className="inline-flex items-center gap-1 mt-3 text-sm text-secondary-soft"
        >
          <PlusCircle size={14} />
          Wedstrijd toevoegen
        </Link>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mt-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="rounded-xl border h-14 animate-pulse bg-surface border-border"
        />
      ))}
    </div>
  )
}

interface EmptyNoLeagueProps {
  isAdmin: boolean
}

function EmptyNoLeague({ isAdmin }: EmptyNoLeagueProps) {
  return (
    <div className="rounded-xl p-8 border text-center mt-4 bg-surface border-border">
      <Trophy size={40} className="mx-auto mb-3 text-text-faint" />
      <p className="font-medium mb-1">Geen competitie ingesteld</p>
      <p className="text-sm mb-4 text-text-muted">
        Er is nog geen poule aangemaakt voor dit team.
      </p>
      {isAdmin && (
        <Link
          to="/admin/league"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-secondary-text"
        >
          <PlusCircle size={16} />
          Poule aanmaken
        </Link>
      )}
    </div>
  )
}

interface StandingRow {
  id: string
  name: string
  is_own_team: boolean
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

/**
 * Onderling resultaat tussen twee teams: punten (en bij gelijke punten het
 * doelsaldo) uit alleen de wedstrijden die deze twee teams tegen elkaar
 * speelden — laatste stap in de ranking-tiebreak van MiniStandings. Positief
 * betekent teamB hoger, negatief teamA hoger, 0 = nog niet tegen elkaar
 * gespeeld (of nog gelijk), wat de sort ongewijzigd laat.
 */
function headToHead(matches: LeagueMatchRow[], teamAId: string, teamBId: string): number {
  let pointsA = 0, pointsB = 0, gdA = 0, gdB = 0

  for (const m of matches) {
    if (m.score_home === null || m.score_away === null) continue
    const aIsHome = m.home_team_id === teamAId && m.away_team_id === teamBId
    const bIsHome = m.home_team_id === teamBId && m.away_team_id === teamAId
    if (!aIsHome && !bIsHome) continue

    const [scoreA, scoreB] = aIsHome ? [m.score_home, m.score_away] : [m.score_away, m.score_home]
    gdA += scoreA - scoreB
    gdB += scoreB - scoreA
    if (scoreA > scoreB) pointsA += 3
    else if (scoreA < scoreB) pointsB += 3
    else { pointsA++; pointsB++ }
  }

  if (pointsB !== pointsA) return pointsB - pointsA
  return gdB - gdA
}

interface MiniStandingsProps {
  matches: LeagueMatchRow[]
  teams: LeagueTeamFull[]
}

function MiniStandings({ matches, teams }: MiniStandingsProps) {
  const standings = useMemo((): StandingRow[] => {
    const table: Record<string, StandingRow> = {}
    teams.forEach((t) => {
      table[t.id] = {
        id: t.id,
        name: leagueTeamDisplayName(t),
        is_own_team: t.is_own_team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        points: 0,
      }
    })

    matches.forEach((m) => {
      if (m.score_home === null || m.score_away === null) return
      const h = table[m.home_team_id]
      const a = table[m.away_team_id]
      if (!h || !a) return

      h.played++
      a.played++
      h.gf += m.score_home
      h.ga += m.score_away
      a.gf += m.score_away
      a.ga += m.score_home

      if (m.score_home > m.score_away) {
        h.won++
        a.lost++
        h.points += 3
      } else if (m.score_home < m.score_away) {
        a.won++
        h.lost++
        a.points += 3
      } else {
        h.drawn++
        a.drawn++
        h.points++
        a.points++
      }
    })

    // Ranking: 1) punten, 2) gewonnen wedstrijden, 3) netto doelsaldo, 4) doelpunten
    // voor, 5) onderling resultaat — in deze exacte volgorde, elk criterium beslist
    // pas als alles ervoor gelijk is.
    return Object.values(table).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.won !== a.won) return b.won - a.won
      const gdA = a.gf - a.ga
      const gdB = b.gf - b.ga
      if (gdB !== gdA) return gdB - gdA
      if (b.gf !== a.gf) return b.gf - a.gf
      return headToHead(matches, a.id, b.id)
    })
  }, [matches, teams])

  if (standings.length === 0) return null

  return (
    <div className="rounded-xl border overflow-hidden bg-surface border-border">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Stand</h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted bg-surface-2">
            <th className="text-left px-3 py-2 font-medium w-6">#</th>
            <th className="text-left px-3 py-2 font-medium">Team</th>
            <th className="text-center px-2 py-2 font-medium">G</th>
            <th className="text-center px-2 py-2 font-medium">W</th>
            <th className="text-center px-2 py-2 font-medium">D</th>
            <th className="text-center px-2 py-2 font-medium">V</th>
            <th className="text-center px-2 py-2 font-medium">Pnt</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => (
            <tr
              key={row.id}
              className="border-t border-border"
              style={{
                backgroundColor: row.is_own_team ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}
            >
              <td className="px-3 py-2.5 text-text-muted">
                {i + 1}
              </td>
              <td className={`px-3 py-2.5 font-medium ${row.is_own_team ? 'text-secondary-soft' : ''}`}>
                {row.name}
              </td>
              <td className="text-center px-2 py-2.5 text-text-muted">{row.played}</td>
              <td className="text-center px-2 py-2.5 text-text-muted">{row.won}</td>
              <td className="text-center px-2 py-2.5 text-text-muted">{row.drawn}</td>
              <td className="text-center px-2 py-2.5 text-text-muted">{row.lost}</td>
              <td className="text-center px-2 py-2.5 font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Matches() {
  const { activeTeam, teamSettings } = useTeamStore()
  const { isTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isTeamAdmin(activeTeam?.id ?? '') || isPlatformAdmin()

  const [activeTab, setActiveTab] = useState('overzicht')
  const [ownOnly, setOwnOnly] = useState(true)

  const { data, isLoading: loading } = useQuery<MatchesQueryData>({
    // De toggle hoort in de key: anders blijft de oude, mét-poule uitkomst in de
    // cache staan als een Hoofdbeheerder de competitie uitzet.
    queryKey: ['matches', activeTeam?.id, teamSettings.competitie_enabled],
    queryFn: async (): Promise<MatchesQueryData> => {
      // Met de competitie-toggle uit wordt de poule niet eens opgehaald; het scherm
      // valt dan door naar exact dezelfde tak als een team dat geen poule heeft.
      const { data: leagueData } = teamSettings.competitie_enabled
        ? await supabase
            .from('leagues')
            .select('*')
            .eq('team_id', activeTeam!.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null }

      // Own matches are loaded regardless of whether a league exists — a team can
      // play only friendlies, and even a team with a poule has fixtures that have
      // no `league_match_id` (friendlies, cup games). Filtering those out here is
      // what used to make them unreachable from this screen entirely.
      const ownMatchesQuery = supabase
        .from('matches')
        .select('id, match_date, match_time, opponent, is_home, score_home, score_away, league_match_id')
        .eq('team_id', activeTeam!.id)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true, nullsFirst: false })

      const membersQuery = supabase
        .from('team_memberships')
        .select('player_id, profiles(full_name, nickname)')
        .eq('team_id', activeTeam!.id)
        .eq('active', true)

      if (!leagueData) {
        const [ownMatchesRes, membersRes] = await Promise.all([ownMatchesQuery, membersQuery])
        const ownMatches = (ownMatchesRes.data || []) as unknown as OwnMatchRow[]
        return {
          league: null,
          leagueTeams: [],
          matches: [],
          ownMatches,
          ownMatchMap: {},
          goalsMap: await loadGoalsMap(ownMatches.map(m => m.id)),
          teamMembers: (membersRes.data || []) as unknown as MemberRow[],
          logoMap: {},
        }
      }

      const [teamsRes, matchesRes, ownMatchesRes, membersRes] = await Promise.all([
        supabase.from('league_teams').select('id, team_name, short_name, is_own_team, registry_id, clubs_registry(logo_url)').eq('league_id', leagueData.id),
        supabase
          .from('league_matches')
          .select('*, home_team:home_team_id(id,team_name,short_name,is_own_team), away_team:away_team_id(id,team_name,short_name,is_own_team)')
          .eq('league_id', leagueData.id)
          .order('match_date', { ascending: true })
          .order('match_time', { ascending: true, nullsFirst: false }),
        ownMatchesQuery,
        membersQuery,
      ])

      // Build logoMap: leagueTeamId → logo_url
      const lMap: Record<string, string> = {}
      for (const t of (teamsRes.data || []) as unknown as LeagueTeamFull[]) {
        if (t.clubs_registry?.logo_url) lMap[t.id] = t.clubs_registry.logo_url
      }

      const ownMatches = (ownMatchesRes.data || []) as unknown as OwnMatchRow[]

      // Build leagueMatchId → matchId map
      const lmMap: Record<string, string> = {}
      for (const m of ownMatches) {
        if (m.league_match_id) lmMap[m.league_match_id] = m.id
      }

      return {
        league: leagueData as unknown as LeagueData,
        leagueTeams: (teamsRes.data || []) as unknown as LeagueTeamFull[],
        matches: (matchesRes.data || []) as unknown as LeagueMatchRow[],
        ownMatches,
        ownMatchMap: lmMap,
        goalsMap: await loadGoalsMap(ownMatches.map(m => m.id)),
        teamMembers: (membersRes.data || []) as unknown as MemberRow[],
        logoMap: lMap,
      }
    },
    enabled: !!activeTeam?.id,
  })

  // Met de competitie-toggle uit gedraagt het scherm zich exact als een team
  // zonder poule: geen stand, geen "Hele poule"-tab, geen league-header. De
  // gegevens worden nog wel geladen, zodat aanzetten meteen weer werkt.
  const league = data?.league || null
  const leagueTeams = data?.leagueTeams || []
  const matches = data?.matches || []
  const ownMatches = useMemo(() => data?.ownMatches || [], [data])
  const ownMatchMap = data?.ownMatchMap || {}
  const goalsMap = data?.goalsMap || {}
  const teamMembers = data?.teamMembers || []
  const logoMap = data?.logoMap || {}

  const today = new Date().toISOString().split('T')[0]

  // --- Own-team view: name, crest and opponent resolution ---
  // Our own side comes from the league row when there is one (it carries the
  // short name and the club crest); a team without a poule falls back to its
  // own team name.
  const ownLeagueTeam = leagueTeams.find(t => t.is_own_team)
  const ownName = ownLeagueTeam ? leagueTeamDisplayName(ownLeagueTeam) : (activeTeam?.name ?? 'Ons team')
  const ownLogo = ownLeagueTeam ? logoMap[ownLeagueTeam.id] : undefined

  const resolveOpponent = useOpponentName()

  // `matches.opponent` is free text, so the crest can only be found by matching
  // that text back onto a league_teams row. A friendly simply has none.
  const opponentLogo = useCallback(
    (opponent: string | null | undefined): string | undefined => {
      if (!opponent) return undefined
      const lt = leagueTeams.find(t => t.team_name === opponent)
      return lt ? logoMap[lt.id] : undefined
    },
    [leagueTeams, logoMap],
  )

  const ownUpcoming = useMemo(
    () => ownMatches.filter((m) => m.match_date > today || (m.match_date === today && m.score_home === null)),
    [ownMatches, today]
  )

  const ownResults = useMemo(
    () => ownMatches
      .filter((m) => m.match_date < today && m.score_home !== null)
      .sort((a, b) => (a.match_date < b.match_date ? 1 : -1)),
    [ownMatches, today]
  )

  const ownOverzicht = useMemo(() => (ownUpcoming.length > 0 ? [ownUpcoming[0]] : []), [ownUpcoming])

  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.match_date > today || (m.match_date === today && m.score_home === null)),
    [matches, today]
  )

  // The three lists below only ever render in the "Hele poule" view, so they no
  // longer need an ownOnly branch — the own-team side is fed from `matches`.
  const resultsMatches = useMemo(
    () => matches
      .filter((m) => m.match_date < today && m.score_home !== null)
      .sort((a, b) => (a.match_date < b.match_date ? 1 : -1)),
    [matches, today]
  )

  // Overzicht, poule view: everything in the next two weeks.
  const overzichtMatches = useMemo(() => {
    const twoWeeksOut = new Date()
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
    const twoWeeksStr = twoWeeksOut.toISOString().split('T')[0]
    return matches.filter((m) => m.match_date >= today && m.match_date <= twoWeeksStr)
  }, [matches, today])

  function groupByDate<T extends { match_date: string }>(list: T[]): Record<string, T[]> {
    const groups: Record<string, T[]> = {}
    list.forEach((m) => {
      if (!groups[m.match_date]) groups[m.match_date] = []
      groups[m.match_date].push(m)
    })
    return groups
  }

  const programmaGroups = groupByDate(upcomingMatches)
  const uitslagenGroups = groupByDate(resultsMatches)
  const overzichtGroups = groupByDate(overzichtMatches)

  const ownOverzichtGroups = groupByDate(ownOverzicht)
  const ownProgrammaGroups = groupByDate(ownUpcoming)
  const ownUitslagenGroups = groupByDate(ownResults)

  // A team without a poule has nothing to toggle to, so it always sees the own view.
  const showOwn = ownOnly || !league

  const ownGroupProps = { ownName, ownLogo, resolveOpponent, opponentLogo, isAdmin }

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="pt-2 flex items-start justify-between">
        <div>
          {league && (
            <p className="text-xs uppercase tracking-wide mb-0.5 text-text-muted">
              {league.name}
            </p>
          )}
          <h1 className="text-2xl font-bold">Wedstrijden</h1>
          {league?.season && (
            <p className="text-sm text-text-muted">
              {league.season}
            </p>
          )}
        </div>
        {isAdmin && league && (
          <Link
            to="/admin/league/results"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 bg-secondary text-secondary-text"
          >
            <Plus size={14} />
            Uitslag invoeren
          </Link>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === tab.key ? 'var(--color-secondary)' : 'var(--color-text-muted)',
            }}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-secondary" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !league && ownMatches.length === 0 ? (
        <EmptyNoLeague isAdmin={isAdmin} />
      ) : (
        <>
          {/* OVERZICHT TAB */}
          {activeTab === 'overzicht' && (
            <div className="space-y-4">
              {league && <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />}

              <div>
                <p className="text-sm font-semibold mb-3">
                  {showOwn ? 'Volgende wedstrijd' : 'Komende 2 weken'}
                </p>
                {showOwn ? (
                  ownOverzicht.length > 0 ? (
                    Object.entries(ownOverzichtGroups)
                      .sort(([a], [b]) => (a < b ? -1 : 1))
                      .map(([date, group]) => (
                        <OwnMatchGroup key={date} dateStr={date} matches={group} {...ownGroupProps} />
                      ))
                  ) : (
                    <EmptyMatches label="Geen aankomende wedstrijden" />
                  )
                ) : overzichtMatches.length > 0 ? (
                  Object.entries(overzichtGroups)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([date, group]) => (
                      <MatchGroup key={date} dateStr={date} matches={group} logoMap={logoMap} />
                    ))
                ) : (
                  <EmptyMatches label="Geen wedstrijden de komende twee weken" />
                )}
              </div>

              {league && <MiniStandings matches={matches} teams={leagueTeams} />}
            </div>
          )}

          {/* PROGRAMMA TAB */}
          {activeTab === 'programma' && (
            <div className="space-y-4">
              {league && <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />}

              {showOwn ? (
                ownUpcoming.length === 0 ? (
                  <EmptyMatches label="Geen aankomende wedstrijden" isAdmin={isAdmin} />
                ) : (
                  Object.entries(ownProgrammaGroups)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([date, group]) => (
                      <OwnMatchGroup key={date} dateStr={date} matches={group} {...ownGroupProps} />
                    ))
                )
              ) : upcomingMatches.length === 0 ? (
                <EmptyMatches label="Geen aankomende wedstrijden" isAdmin={isAdmin} />
              ) : (
                Object.entries(programmaGroups)
                  .sort(([a], [b]) => (a < b ? -1 : 1))
                  .map(([date, group]) => (
                    <MatchGroup key={date} dateStr={date} matches={group} logoMap={logoMap} />
                  ))
              )}
            </div>
          )}

          {/* UITSLAGEN TAB */}
          {activeTab === 'uitslagen' && (
            <div>
              {league && <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />}

              {showOwn ? (
                ownResults.length === 0 ? (
                  <EmptyMatches label="Geen eigen uitslagen beschikbaar" icon="trophy" />
                ) : (
                  Object.entries(ownUitslagenGroups)
                    .sort(([a], [b]) => (a > b ? -1 : 1))
                    .map(([date, group]) => (
                      <OwnMatchGroup
                        key={date}
                        dateStr={date}
                        matches={group}
                        resultMode
                        goalsMap={goalsMap}
                        teamMembers={teamMembers}
                        {...ownGroupProps}
                      />
                    ))
                )
              ) : resultsMatches.length === 0 ? (
                <EmptyMatches label="Nog geen uitslagen beschikbaar" icon="trophy" />
              ) : (
                Object.entries(uitslagenGroups)
                  .sort(([a], [b]) => (a > b ? -1 : 1))
                  .map(([date, group]) => (
                    <MatchGroup
                      key={date}
                      dateStr={date}
                      matches={group}
                      resultMode
                      ownMatchMap={ownMatchMap}
                      goalsMap={goalsMap}
                      teamMembers={teamMembers}
                      isAdmin={isAdmin}
                      logoMap={logoMap}
                    />
                  ))
              )}
            </div>
          )}
        </>
      )}

    </div>
  )
}
