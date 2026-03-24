import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Calendar, PlusCircle, ChevronRight } from 'lucide-react'
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

function TeamName({ team }) {
  if (!team) return <span style={{ color: 'var(--color-text-muted)' }}>?</span>
  if (team.is_own_team) {
    return <span className="text-amber-400 font-semibold">{team.team_name}</span>
  }
  return <span>{team.team_name}</span>
}

function MatchCard({ match }) {
  const isPlayed = match.score_home !== null && match.score_away !== null
  const homeIsOwn = match.home_team?.is_own_team
  const awayIsOwn = match.away_team?.is_own_team

  // Winner gets slightly brighter text in results
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
        {/* Home team */}
        <div className="flex-1 text-right text-sm" style={homeIsOwn ? {} : homeStyle}>
          <TeamName team={match.home_team} />
        </div>

        {/* Center: score or time */}
        <div className="flex-shrink-0 w-20 text-center">
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

        {/* Away team */}
        <div className="flex-1 text-left text-sm" style={awayIsOwn ? {} : awayStyle}>
          <TeamName team={match.away_team} />
        </div>
      </div>

      {match.matchday && (
        <p className="text-center text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Speelronde {match.matchday}
        </p>
      )}
    </div>
  )
}

function MatchGroup({ dateStr, matches }) {
  return (
    <div>
      <p
        className="text-xs font-bold uppercase tracking-wide mb-2 mt-5 first:mt-0"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {capitalize(formatMatchDate(dateStr))}
      </p>
      <div className="space-y-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
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
          style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
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
  const { isTeamAdmin } = useAuthStore()
  const isAdmin = isTeamAdmin(activeTeam?.id)

  const [activeTab, setActiveTab] = useState('overzicht')
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState(null)
  const [leagueTeams, setLeagueTeams] = useState([])
  const [matches, setMatches] = useState([])

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

    const [teamsRes, matchesRes] = await Promise.all([
      supabase.from('league_teams').select('*').eq('league_id', leagueData.id),
      supabase
        .from('league_matches')
        .select(
          '*, home_team:home_team_id(id,team_name,is_own_team), away_team:away_team_id(id,team_name,is_own_team)'
        )
        .eq('league_id', leagueData.id)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true, nullsFirst: false }),
    ])

    setLeagueTeams(teamsRes.data || [])
    setMatches(matchesRes.data || [])
    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]

  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.match_date > today || (m.match_date === today && m.score_home === null)),
    [matches, today]
  )

  const resultsMatches = useMemo(
    () =>
      matches
        .filter((m) => m.match_date < today && m.score_home !== null)
        .sort((a, b) => (a.match_date < b.match_date ? 1 : -1)),
    [matches, today]
  )

  const overzichtMatches = useMemo(() => {
    const twoWeeksOut = new Date()
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
    const twoWeeksStr = twoWeeksOut.toISOString().split('T')[0]
    return matches.filter((m) => m.match_date >= today && m.match_date <= twoWeeksStr)
  }, [matches, today])

  function groupByDate(list) {
    const groups = {}
    list.forEach((m) => {
      if (!groups[m.match_date]) groups[m.match_date] = []
      groups[m.match_date].push(m)
    })
    return groups
  }

  const programmaGroups = groupByDate(upcomingMatches)
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
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold mb-3">
                  {overzichtMatches.length > 0 ? 'Komende 2 weken' : 'Aankomende wedstrijden'}
                </p>
                {overzichtMatches.length > 0 ? (
                  Object.entries(overzichtGroups)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([date, group]) => (
                      <MatchGroup key={date} dateStr={date} matches={group} />
                    ))
                ) : (
                  <div
                    className="rounded-xl p-5 border text-center"
                    style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  >
                    <Calendar size={28} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      Geen wedstrijden de komende twee weken
                    </p>
                  </div>
                )}
              </div>

              <MiniStandings matches={matches} teams={leagueTeams} />
            </div>
          )}

          {/* PROGRAMMA TAB */}
          {activeTab === 'programma' && (
            <div>
              {upcomingMatches.length === 0 ? (
                <div
                  className="rounded-xl p-6 border text-center mt-2"
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
                    <MatchGroup key={date} dateStr={date} matches={group} />
                  ))
              )}
            </div>
          )}

          {/* UITSLAGEN TAB */}
          {activeTab === 'uitslagen' && (
            <div>
              {resultsMatches.length === 0 ? (
                <div
                  className="rounded-xl p-6 border text-center mt-2"
                  style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <Trophy size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Nog geen uitslagen beschikbaar
                  </p>
                </div>
              ) : (
                Object.entries(uitslagenGroups)
                  .sort(([a], [b]) => (a > b ? -1 : 1))
                  .map(([date, group]) => (
                    <MatchGroup key={date} dateStr={date} matches={group} />
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
          style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
        >
          <PlusCircle size={18} />
          Wedstrijd
        </Link>
      )}
    </div>
  )
}
