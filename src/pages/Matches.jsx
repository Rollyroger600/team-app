import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Calendar, PlusCircle, ChevronRight, ChevronDown, ChevronUp, Target, Plus, Trash2, Users, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'
import useAuthStore from '../stores/useAuthStore'

const TABS = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'programma', label: 'Programma' },
  { key: 'uitslagen', label: 'Uitslagen' },
]

function formatMatchDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return 'n.n.b.'
  return timeStr.slice(0, 5)
}

function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function displayName(profile) {
  return profile?.nickname || profile?.full_name?.split(' ')[0] || '?'
}

function TeamName({ team }) {
  if (!team) return <span style={{ color: 'var(--color-text-muted)' }}>?</span>
  if (team.is_own_team) {
    return <span className="text-amber-400 font-semibold">{team.team_name}</span>
  }
  return <span>{team.team_name}</span>
}

function TeamLogo({ url, name }) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={name || ''}
      className="rounded-full object-contain flex-shrink-0"
      style={{ width: 22, height: 22, backgroundColor: 'var(--color-surface)' }}
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}

// --- Inline goal section for own matches ---
function GoalSection({ matchId, goals: initialGoals, members, isAdmin }) {
  const [open, setOpen] = useState(false)
  const [goals, setGoals] = useState(initialGoals)
  const [form, setForm] = useState({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false })
  const [saving, setSaving] = useState(false)

  // Keep in sync if parent reloads
  useEffect(() => { setGoals(initialGoals) }, [initialGoals])

  async function addGoal(e) {
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
      })
      .select('id, match_id, minute, is_own_goal, is_penalty, scorer_id, assist_id, scorer:profiles!goals_scorer_id_fkey(full_name, nickname), assist:profiles!goals_assist_id_fkey(full_name, nickname)')
      .single()
    if (data) setGoals(prev => [...prev, data].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999)))
    setForm({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false })
    setSaving(false)
  }

  async function deleteGoal(goalId) {
    await supabase.from('goals').delete().eq('id', goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const inputStyle = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span className="flex items-center gap-1.5">
          <Target size={12} />
          {goals.length > 0 ? `${goals.length} doelpunt${goals.length !== 1 ? 'en' : ''}` : isAdmin ? 'Doelpunten invoeren' : 'Geen doelpunten geregistreerd'}
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {goals.length > 0 && (
            <div className="space-y-1">
              {goals.map(g => (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="w-7 text-right flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {g.minute ? `${g.minute}'` : '–'}
                  </span>
                  <span className="flex-1">
                    {g.is_own_goal ? `${displayName(g.scorer)} (eigen doel)` : displayName(g.scorer)}
                    {g.assist?.full_name && (
                      <span className="ml-1.5" style={{ color: 'var(--color-text-muted)' }}>assist: {displayName(g.assist)}</span>
                    )}
                    {g.is_penalty && <span className="text-amber-400 ml-1.5">strafbal</span>}
                  </span>
                  {isAdmin && (
                    <button onClick={() => deleteGoal(g.id)} className="text-slate-600 hover:text-red-400 transition-colors p-0.5 flex-shrink-0">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <form onSubmit={addGoal} className="space-y-1.5 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex gap-1.5 pt-1.5">
                <select
                  value={form.scorer_id}
                  onChange={e => setForm(p => ({ ...p, scorer_id: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="">Schutter...</option>
                  {members.map(m => (
                    <option key={m.player_id} value={m.player_id}>{displayName(m.profiles)}</option>
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
                  <option key={m.player_id} value={m.player_id}>{displayName(m.profiles)}</option>
                ))}
              </select>
              <div className="flex gap-3 text-xs">
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
              </div>
              <button
                type="submit"
                disabled={saving || (!form.scorer_id && !form.is_own_goal)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
              >
                <Plus size={12} />
                {saving ? 'Opslaan...' : 'Doelpunt toevoegen'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// --- Availability section (compact, used in both upcoming and past match cards) ---
const STATUS_COLORS = {
  available:   { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.4)',  text: '#4ade80' },
  unavailable: { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  text: '#f87171' },
  maybe:       { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
}

function AvailabilitySection({ matchId, initialPlayers, userId, isUpcoming }) {
  const [players, setPlayers] = useState(initialPlayers || [])
  const [saving, setSaving] = useState(false)
  const [open, setOpen]     = useState(false)

  useEffect(() => { setPlayers(initialPlayers || []) }, [initialPlayers])

  const available   = players.filter(p => p.status === 'available')
  const unavailable = players.filter(p => p.status === 'unavailable')
  const maybe       = players.filter(p => p.status === 'maybe')
  const myStatus    = players.find(p => p.player_id === userId)?.status || null

  function dname(p) { return p.profiles?.nickname || p.profiles?.full_name?.split(' ')[0] || '?' }

  async function setMyAvail(status) {
    if (saving) return
    setSaving(true)
    await supabase.from('match_availability').upsert(
      { match_id: matchId, player_id: userId, status, responded_at: new Date().toISOString() },
      { onConflict: 'match_id,player_id' }
    )
    setPlayers(prev => {
      const me = prev.find(p => p.player_id === userId)
      const rest = prev.filter(p => p.player_id !== userId)
      return [...rest, { ...(me || { player_id: userId, profiles: null }), status }]
    })
    setSaving(false)
  }

  if (!isUpcoming) {
    // Past match: show who was there, collapsible
    if (available.length === 0) return null
    return (
      <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <Users size={12} />
            {available.length} aanwezig
          </span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {open && (
          <div className="px-3 pb-3 flex flex-wrap gap-1">
            {available.map((p, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.available.bg, color: STATUS_COLORS.available.text }}>
                {dname(p)}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Upcoming match: my status buttons + counts, expandable player list
  const myColors = myStatus ? STATUS_COLORS[myStatus] : null
  const myLabel  = myStatus === 'available' ? 'Beschikbaar' : myStatus === 'unavailable' ? 'Niet beschikbaar' : myStatus === 'maybe' ? 'Misschien' : 'Jouw opgave'

  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors"
        style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-2">
          <Users size={12} />
          <span style={{ color: myColors?.text || 'var(--color-text-muted)' }}>{myLabel}</span>
          <span>• {available.length}✓ {unavailable.length}✗ {maybe.length}?</span>
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex gap-1.5">
            {[
              { status: 'available',   label: 'Beschikbaar' },
              { status: 'unavailable', label: 'Niet' },
              { status: 'maybe',       label: 'Misschien' },
            ].map(({ status, label }) => {
              const c = STATUS_COLORS[status]
              const active = myStatus === status
              return (
                <button key={status} onClick={() => setMyAvail(status)} disabled={saving}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
                  style={{ backgroundColor: active ? c.bg : 'transparent', borderColor: active ? c.border : 'var(--color-border)', color: active ? c.text : 'var(--color-text-muted)' }}>
                  {label}
                </button>
              )
            })}
          </div>
          {players.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...available, ...maybe, ...unavailable].map((p, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[p.status].bg, color: STATUS_COLORS[p.status].text }}>
                  {dname(p)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Match card for programma/overzicht ---
function MatchCard({ match, logoMap = {}, matchId, availability, userId }) {
  const isPlayed = match.score_home !== null && match.score_away !== null
  const homeIsOwn = match.home_team?.is_own_team
  const awayIsOwn = match.away_team?.is_own_team

  let homeStyle = {}
  let awayStyle = {}
  if (isPlayed && !homeIsOwn && !awayIsOwn) {
    if (match.score_home > match.score_away) homeStyle = { color: 'var(--color-text)' }
    else if (match.score_away > match.score_home) awayStyle = { color: 'var(--color-text)' }
  }

  return (
    <div
      className="rounded-xl px-3 py-3 border"
      style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center justify-end gap-1.5 text-sm" style={homeIsOwn ? {} : homeStyle}>
          <TeamName team={match.home_team} />
          <TeamLogo url={logoMap[match.home_team?.id]} name={match.home_team?.team_name} />
        </div>
        <div className="flex-shrink-0 w-16 text-center">
          {isPlayed ? (
            <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
              {match.score_home}–{match.score_away}
            </span>
          ) : (
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {formatTime(match.match_time)}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1.5 text-sm" style={awayIsOwn ? {} : awayStyle}>
          <TeamLogo url={logoMap[match.away_team?.id]} name={match.away_team?.team_name} />
          <TeamName team={match.away_team} />
        </div>
      </div>
      {match.matchday && (
        <p className="text-center text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Speelronde {match.matchday}
        </p>
      )}
      {matchId && userId && (
        <AvailabilitySection
          matchId={matchId}
          initialPlayers={availability?.players || []}
          userId={userId}
          isUpcoming
        />
      )}
    </div>
  )
}

// --- Result card for uitslagen tab (includes goal section for own matches) ---
function ResultCard({ match, matchId, goals, members, isAdmin, logoMap = {}, availability, userId }) {
  const homeIsOwn = match.home_team?.is_own_team
  const awayIsOwn = match.away_team?.is_own_team
  const isOwnMatch = homeIsOwn || awayIsOwn

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="flex-1 flex items-center justify-end gap-1.5 text-sm">
          <TeamName team={match.home_team} />
          <TeamLogo url={logoMap[match.home_team?.id]} name={match.home_team?.team_name} />
        </div>
        <div className="flex-shrink-0 w-16 text-center">
          <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
            {match.score_home}–{match.score_away}
          </span>
        </div>
        <div className="flex-1 flex items-center gap-1.5 text-sm">
          <TeamLogo url={logoMap[match.away_team?.id]} name={match.away_team?.team_name} />
          <TeamName team={match.away_team} />
        </div>
      </div>
      {match.matchday && (
        <p className="text-center text-xs pb-2" style={{ color: 'var(--color-text-muted)' }}>
          Speelronde {match.matchday}
        </p>
      )}
      {isOwnMatch && matchId && (
        <GoalSection
          matchId={matchId}
          goals={goals || []}
          members={members}
          isAdmin={isAdmin}
        />
      )}
      {isOwnMatch && matchId && userId && (
        <AvailabilitySection
          matchId={matchId}
          initialPlayers={availability?.players || []}
          userId={userId}
          isUpcoming={false}
        />
      )}
    </div>
  )
}

function MatchGroup({ dateStr, matches, resultMode, ownMatchMap, goalsMap, teamMembers, isAdmin, logoMap, availabilityMap, userId }) {
  return (
    <div>
      <p
        className="text-xs font-bold uppercase tracking-wide mb-2 mt-5 first:mt-0"
        style={{ color: 'var(--color-text-muted)' }}
      >
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
              availability={availabilityMap?.[ownMatchMap?.[m.id]]}
              userId={userId}
            />
          ) : (
            <MatchCard
              key={m.id}
              match={m}
              logoMap={logoMap}
              matchId={ownMatchMap?.[m.id]}
              availability={availabilityMap?.[ownMatchMap?.[m.id]]}
              userId={userId}
            />
          )
        )}
      </div>
    </div>
  )
}

function FilterToggle({ ownOnly, onChange }) {
  return (
    <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
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

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mt-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="rounded-xl border h-14 animate-pulse"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        />
      ))}
    </div>
  )
}

function EmptyNoLeague({ isAdmin }) {
  return (
    <div
      className="rounded-xl p-8 border text-center mt-4"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <Trophy size={40} className="mx-auto mb-3 text-slate-600" />
      <p className="font-medium mb-1">Geen competitie ingesteld</p>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        Er is nog geen poule aangemaakt voor dit team.
      </p>
      {isAdmin && (
        <Link
          to="/admin/league"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
        >
          <PlusCircle size={16} />
          Poule aanmaken
        </Link>
      )}
    </div>
  )
}

function MiniStandings({ matches, teams }) {
  const standings = useMemo(() => {
    const table = {}
    teams.forEach((t) => {
      table[t.id] = {
        id: t.id,
        name: t.team_name,
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

    return Object.values(table).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return (b.gf - b.ga) - (a.gf - a.ga)
    })
  }, [matches, teams])

  if (standings.length === 0) return null

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <h3 className="font-semibold text-sm">Stand</h3>
        <Link to="/standings" className="text-xs text-amber-400 flex items-center gap-0.5">
          Volledig <ChevronRight size={12} />
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-2)' }}>
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
              className="border-t"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: row.is_own_team ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}
            >
              <td className="px-3 py-2.5" style={{ color: 'var(--color-text-muted)' }}>
                {i + 1}
              </td>
              <td className={`px-3 py-2.5 font-medium ${row.is_own_team ? 'text-amber-400' : ''}`}>
                {row.name}
              </td>
              <td className="text-center px-2 py-2.5" style={{ color: 'var(--color-text-muted)' }}>{row.played}</td>
              <td className="text-center px-2 py-2.5" style={{ color: 'var(--color-text-muted)' }}>{row.won}</td>
              <td className="text-center px-2 py-2.5" style={{ color: 'var(--color-text-muted)' }}>{row.drawn}</td>
              <td className="text-center px-2 py-2.5" style={{ color: 'var(--color-text-muted)' }}>{row.lost}</td>
              <td className="text-center px-2 py-2.5 font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Matches() {
  const { activeTeam } = useTeamStore()
  const { user, isTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isTeamAdmin(activeTeam?.id) || isPlatformAdmin()

  const [activeTab, setActiveTab] = useState('overzicht')
  const [ownOnly, setOwnOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState(null)
  const [leagueTeams, setLeagueTeams] = useState([])
  const [matches, setMatches] = useState([])
  // leagueMatchId → matchId (from the `matches` table)
  const [ownMatchMap, setOwnMatchMap] = useState({})
  // matchId → goals[]
  const [goalsMap, setGoalsMap] = useState({})
  const [teamMembers, setTeamMembers] = useState([])
  // leagueTeamId → logo_url
  const [logoMap, setLogoMap] = useState({})
  // matchId → { players: [{player_id, status, profiles}] }
  const [availabilityMap, setAvailabilityMap] = useState({})

  useEffect(() => {
    if (!activeTeam?.id) return
    loadData()
  }, [activeTeam?.id])

  async function loadData() {
    setLoading(true)

    const { data: leagueData } = await supabase
      .from('leagues')
      .select('*')
      .eq('team_id', activeTeam.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!leagueData) {
      setLeague(null)
      setLoading(false)
      return
    }

    setLeague(leagueData)

    const [teamsRes, matchesRes, ownMatchesRes, membersRes] = await Promise.all([
      supabase.from('league_teams').select('id, team_name, is_own_team, registry_id, clubs_registry(logo_url)').eq('league_id', leagueData.id),
      supabase
        .from('league_matches')
        .select('*, home_team:home_team_id(id,team_name,is_own_team), away_team:away_team_id(id,team_name,is_own_team)')
        .eq('league_id', leagueData.id)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true, nullsFirst: false }),
      supabase
        .from('matches')
        .select('id, league_match_id')
        .eq('team_id', activeTeam.id)
        .not('league_match_id', 'is', null),
      supabase
        .from('team_memberships')
        .select('player_id, profiles(full_name, nickname)')
        .eq('team_id', activeTeam.id)
        .eq('active', true),
    ])

    setLeagueTeams(teamsRes.data || [])
    setMatches(matchesRes.data || [])
    setTeamMembers(membersRes.data || [])

    // Build logoMap: leagueTeamId → logo_url
    const lMap = {}
    for (const t of teamsRes.data || []) {
      if (t.clubs_registry?.logo_url) lMap[t.id] = t.clubs_registry.logo_url
    }
    setLogoMap(lMap)

    // Build leagueMatchId → matchId map
    const lmMap = {}
    for (const m of ownMatchesRes.data || []) lmMap[m.league_match_id] = m.id
    setOwnMatchMap(lmMap)

    // Load goals + availability for own matches
    const matchIds = (ownMatchesRes.data || []).map(m => m.id)
    if (matchIds.length > 0) {
      const [goalsRes, availRes] = await Promise.all([
        supabase
          .from('goals')
          .select('id, match_id, minute, is_own_goal, is_penalty, scorer_id, assist_id, scorer:profiles!goals_scorer_id_fkey(full_name, nickname), assist:profiles!goals_assist_id_fkey(full_name, nickname)')
          .in('match_id', matchIds)
          .order('minute', { ascending: true, nullsFirst: false }),
        supabase
          .from('match_availability')
          .select('match_id, player_id, status, profiles(full_name, nickname)')
          .in('match_id', matchIds),
      ])

      const gMap = {}
      for (const g of goalsRes.data || []) {
        if (!gMap[g.match_id]) gMap[g.match_id] = []
        gMap[g.match_id].push(g)
      }
      setGoalsMap(gMap)

      const avMap = {}
      for (const a of availRes.data || []) {
        if (!avMap[a.match_id]) avMap[a.match_id] = { players: [] }
        avMap[a.match_id].players.push({ player_id: a.player_id, status: a.status, profiles: a.profiles })
      }
      setAvailabilityMap(avMap)
    }

    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]

  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.match_date > today || (m.match_date === today && m.score_home === null)),
    [matches, today]
  )

  const resultsMatches = useMemo(() => {
    const all = matches
      .filter((m) => m.match_date < today && m.score_home !== null)
      .sort((a, b) => (a.match_date < b.match_date ? 1 : -1))
    if (ownOnly) return all.filter(m => m.home_team?.is_own_team || m.away_team?.is_own_team)
    return all
  }, [matches, today, ownOnly])

  // Overzicht: next own match (ownOnly) OR 2-week window (alle poule)
  const overzichtMatches = useMemo(() => {
    if (ownOnly) {
      const next = upcomingMatches.find(m => m.home_team?.is_own_team || m.away_team?.is_own_team)
      return next ? [next] : []
    }
    const twoWeeksOut = new Date()
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
    const twoWeeksStr = twoWeeksOut.toISOString().split('T')[0]
    return matches.filter((m) => m.match_date >= today && m.match_date <= twoWeeksStr)
  }, [matches, upcomingMatches, today, ownOnly])

  // Programma: filtered by ownOnly
  const programmaMatchesFiltered = useMemo(() => {
    if (ownOnly) return upcomingMatches.filter(m => m.home_team?.is_own_team || m.away_team?.is_own_team)
    return upcomingMatches
  }, [upcomingMatches, ownOnly])

  function groupByDate(list) {
    const groups = {}
    list.forEach((m) => {
      if (!groups[m.match_date]) groups[m.match_date] = []
      groups[m.match_date].push(m)
    })
    return groups
  }

  const programmaGroups = groupByDate(programmaMatchesFiltered)
  const uitslagenGroups = groupByDate(resultsMatches)
  const overzichtGroups = groupByDate(overzichtMatches)

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="pt-2 flex items-start justify-between">
        <div>
          {league && (
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {league.name}
            </p>
          )}
          <h1 className="text-2xl font-bold">Wedstrijden</h1>
          {league?.season && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {league.season}
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
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
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-secondary)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !league ? (
        <EmptyNoLeague isAdmin={isAdmin} />
      ) : (
        <>
          {/* OVERZICHT TAB */}
          {activeTab === 'overzicht' && (
            <div className="space-y-4">
              <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />

              <div>
                <p className="text-sm font-semibold mb-3">
                  {ownOnly ? 'Volgende wedstrijd' : 'Komende 2 weken'}
                </p>
                {overzichtMatches.length > 0 ? (
                  Object.entries(overzichtGroups)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([date, group]) => (
                      <MatchGroup key={date} dateStr={date} matches={group} logoMap={logoMap} ownMatchMap={ownMatchMap} availabilityMap={availabilityMap} userId={user?.id} />
                    ))
                ) : (
                  <div
                    className="rounded-xl p-5 border text-center"
                    style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  >
                    <Calendar size={28} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {ownOnly ? 'Geen aankomende wedstrijden' : 'Geen wedstrijden de komende twee weken'}
                    </p>
                  </div>
                )}
              </div>

              <MiniStandings matches={matches} teams={leagueTeams} />
            </div>
          )}

          {/* PROGRAMMA TAB */}
          {activeTab === 'programma' && (
            <div className="space-y-4">
              <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />

              {programmaMatchesFiltered.length === 0 ? (
                <div
                  className="rounded-xl p-6 border text-center"
                  style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <Calendar size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Geen aankomende wedstrijden
                  </p>
                  {isAdmin && (
                    <Link
                      to="/admin/league/matches"
                      className="inline-flex items-center gap-1 mt-3 text-sm text-amber-400"
                    >
                      <PlusCircle size={14} />
                      Wedstrijden toevoegen
                    </Link>
                  )}
                </div>
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
              <FilterToggle ownOnly={ownOnly} onChange={setOwnOnly} />

              {resultsMatches.length === 0 ? (
                <div
                  className="rounded-xl p-6 border text-center mt-2"
                  style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <Trophy size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {ownOnly ? 'Geen eigen uitslagen beschikbaar' : 'Nog geen uitslagen beschikbaar'}
                  </p>
                </div>
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
                      availabilityMap={availabilityMap}
                      userId={user?.id}
                    />
                  ))
              )}
            </div>
          )}
        </>
      )}

      {/* Admin floating button */}
      {isAdmin && league && (
        <Link
          to="/admin/league/matches"
          className="fixed bottom-20 right-4 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-semibold z-10"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
        >
          <PlusCircle size={18} />
          Wedstrijd
        </Link>
      )}
    </div>
  )
}
