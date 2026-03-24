import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, CheckCircle, XCircle, HelpCircle, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { formatDate, formatTime } from '../lib/utils'
import { formatGatheringDisplay } from '../lib/gathering'

export default function Dashboard() {
  const { user, profile } = useAuthStore()
  const { activeTeam, teamSettings } = useTeamStore()
  const [nextMatch, setNextMatch] = useState(null)
  const [myAvailability, setMyAvailability] = useState(null)
  const [availabilityCount, setAvailabilityCount] = useState({ available: 0, total: 0 })
  const [teamAvailability, setTeamAvailability] = useState([])  // [{ player_id, full_name, status }]
  const [totalMembers, setTotalMembers] = useState(0)
  const [showTeam, setShowTeam] = useState(false)
  const [latestAnnouncement, setLatestAnnouncement] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id || !user?.id) return
    loadDashboard()
  }, [activeTeam?.id, user?.id])

  async function loadDashboard() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [matchRes, announcementRes] = await Promise.all([
      supabase.from('matches')
        .select('*')
        .eq('team_id', activeTeam.id)
        .eq('status', 'upcoming')
        .gte('match_date', today)
        .order('match_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.from('announcements')
        .select('*, profiles(full_name)')
        .eq('team_id', activeTeam.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    const match = matchRes.data
    setNextMatch(match)
    setLatestAnnouncement(announcementRes.data)

    if (match) {
      const [myAvRes, allAvRes, membersRes] = await Promise.all([
        supabase.from('match_availability')
          .select('status')
          .eq('match_id', match.id)
          .eq('player_id', user.id)
          .maybeSingle(),
        supabase.from('match_availability')
          .select('player_id, status, profiles(full_name)')
          .eq('match_id', match.id),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam.id)
          .eq('active', true),
      ])
      setMyAvailability(myAvRes.data?.status || null)
      const allAv = allAvRes.data || []
      const available = allAv.filter(a => a.status === 'available').length
      setAvailabilityCount({ available, total: allAv.length })

      const members = membersRes.data || []
      setTotalMembers(members.length)
      const avMap = {}
      for (const a of allAv) avMap[a.player_id] = { status: a.status, name: a.profiles?.full_name }
      setTeamAvailability(members.map(m => ({
        player_id: m.player_id,
        full_name: m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?',
        status: avMap[m.player_id]?.status || null,
      })))
    }
    setLoading(false)
  }

  async function setAvailability(status) {
    if (!nextMatch || !user) return
    await supabase.from('match_availability').upsert({
      match_id: nextMatch.id,
      player_id: user.id,
      status,
      responded_at: new Date().toISOString()
    }, { onConflict: 'match_id,player_id' })
    setMyAvailability(status)
    loadDashboard()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-secondary)' }} />
      </div>
    )
  }

  const gatheringInfo = nextMatch ? formatGatheringDisplay(nextMatch, teamSettings) : null

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="pt-2">
        <p className="text-slate-400 text-sm">Welkom terug,</p>
        <h1 className="text-2xl font-bold">{profile?.full_name?.split(' ')[0] || 'Speler'}</h1>
        <p className="text-slate-400 text-sm">{activeTeam?.name}</p>
      </div>

      {/* Next match card */}
      {nextMatch ? (
        <div className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                {nextMatch.is_home ? 'Thuiswedstrijd' : 'Uitwedstrijd'}
              </p>
              <h2 className="text-xl font-bold">vs {nextMatch.opponent}</h2>
              <p className="text-slate-400 mt-1">
                {formatDate(nextMatch.match_date)} • {formatTime(nextMatch.match_time)}
              </p>
            </div>
            <Link to={`/matches/${nextMatch.id}`}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text)' }}>
              Details
            </Link>
          </div>

          {/* Gathering info */}
          {gatheringInfo && !gatheringInfo.isNtb && (
            <div className="text-sm py-2 px-3 rounded-lg mb-3"
                 style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderLeft: '3px solid var(--color-secondary)' }}>
              <span className="font-semibold text-amber-400">{gatheringInfo.time}</span>
              <span className="text-slate-300 ml-2">{gatheringInfo.label}</span>
            </div>
          )}

          {/* Quick availability buttons */}
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-2">Jouw beschikbaarheid:</p>
            <div className="flex gap-2">
              {[
                { status: 'available', icon: CheckCircle, label: 'Beschikbaar', color: 'bg-green-500/20 border-green-500/50 text-green-400' },
                { status: 'unavailable', icon: XCircle, label: 'Niet beschikbaar', color: 'bg-red-500/20 border-red-500/50 text-red-400' },
                { status: 'maybe', icon: HelpCircle, label: 'Misschien', color: 'bg-amber-500/20 border-amber-500/50 text-amber-400' },
              ].map(({ status, icon: Icon, label, color }) => (
                <button
                  key={status}
                  onClick={() => setAvailability(status)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
                    myAvailability === status
                      ? color + ' ring-2 ring-offset-1 ring-offset-transparent'
                      : 'border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:block">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Team beschikbaarheid uitklap */}
          <button
            onClick={() => setShowTeam(v => !v)}
            className="w-full flex items-center justify-between text-xs pt-2 border-t transition-colors hover:text-slate-300"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              <span>
                <span className={availabilityCount.available >= 11 ? 'text-green-400 font-semibold' : availabilityCount.available >= 8 ? 'text-amber-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {availabilityCount.available}
                </span>
                /{totalMembers} opgegeven beschikbaar
              </span>
            </span>
            {showTeam ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showTeam && teamAvailability.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {teamAvailability.map(m => (
                <div key={m.player_id} className="flex items-center gap-2 text-xs py-0.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    m.status === 'available' ? 'bg-green-400' :
                    m.status === 'unavailable' ? 'bg-red-400' :
                    m.status === 'maybe' ? 'bg-amber-400' : 'bg-slate-600'
                  }`} />
                  <span className={`truncate ${m.player_id === user?.id ? 'text-amber-400' : 'text-slate-300'}`}>
                    {m.full_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-6 border text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <Calendar size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-slate-400">Geen aankomende wedstrijden</p>
        </div>
      )}

      {/* Latest announcement */}
      {latestAnnouncement && (
        <div className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Laatste bericht</h3>
            <Link to="/announcements" className="text-xs text-amber-400">Alle berichten</Link>
          </div>
          {latestAnnouncement.title && (
            <p className="font-medium mb-1">{latestAnnouncement.title}</p>
          )}
          <p className="text-slate-400 text-sm line-clamp-3">{latestAnnouncement.body}</p>
          <p className="text-xs text-slate-500 mt-2">Door {latestAnnouncement.profiles?.full_name}</p>
        </div>
      )}
    </div>
  )
}
