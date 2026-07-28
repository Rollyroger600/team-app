import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, MapPin, Share2, Target, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { useRealtimeInvalidate } from '../lib/realtime'
import { formatDateLong, formatTime, buildWhatsAppUrl, buildShareText, tint } from '../lib/utils'
import type { ShareAvailability } from '../lib/utils'
import { useOpponentName } from '../lib/opponents'
import { PLAYER_STATUSES, STATUSES } from '../lib/availability'
import { formatGatheringDisplay } from '../lib/gathering'
import type { Match, AvailabilityStatus } from '../types/app'

interface MatchDetailData {
  match: Match | null
  myAvailability: AvailabilityStatus | null
  myOverridden: boolean
  availability: { status: string }[]
  names: ShareAvailability
}

export default function MatchDetail() {
  const opponentName = useOpponentName()
  const { id } = useParams<{ id: string }>()
  const { user, isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const { teamSettings, activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [myAvailability, setMyAvailability] = useState<AvailabilityStatus | null>(null)

  useRealtimeInvalidate('match_availability', ['matchDetail', id, user?.id], !!id)

  const { data, isLoading } = useQuery<MatchDetailData>({
    queryKey: ['matchDetail', id, user?.id],
    queryFn: async (): Promise<MatchDetailData> => {
      const [matchRes, myAvRes, allAvRes, membersRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id!).single(),
        supabase.from('match_availability').select('status, overridden').eq('match_id', id!).eq('player_id', user!.id).maybeSingle(),
        // No profiles embed: match_availability has two FKs to profiles
        // (player_id and set_by), which makes an unqualified profiles(...) embed
        // ambiguous and makes PostgREST reject the whole query — the counts below
        // silently read 0 until this was fixed.
        supabase.from('match_availability').select('player_id, status').eq('match_id', id!),
        supabase.from('team_memberships').select('player_id, profiles(full_name, nickname)').eq('team_id', activeTeam!.id).eq('active', true),
      ])

      const avMap: Record<string, string> = {}
      for (const a of (allAvRes.data || []) as { player_id: string; status: string }[]) avMap[a.player_id] = a.status

      const members = (membersRes.data || []) as { player_id: string; profiles: { full_name: string | null; nickname: string | null } | null }[]
      const nameOf = (m: (typeof members)[number]) => m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?'

      const names: MatchDetailData['names'] = {
        available: [], unavailable: [], injured: [], unknown: [], rosteredOff: [],
      }
      for (const m of members) {
        const status = avMap[m.player_id]
        if (status === 'available') names.available.push(nameOf(m))
        else if (status === 'unavailable') names.unavailable.push(nameOf(m))
        else if (status === 'injured') names.injured.push(nameOf(m))
        else if (status === 'rostered_off') names.rosteredOff.push(nameOf(m))
        else names.unknown.push(nameOf(m))
      }

      return {
        match: matchRes.data || null,
        myAvailability: (myAvRes.data?.status as AvailabilityStatus | null) || null,
        myOverridden: (myAvRes.data as { overridden?: boolean } | null)?.overridden === true,
        availability: (allAvRes.data || []) as MatchDetailData['availability'],
        names,
      }
    },
    enabled: !!id && !!user?.id && !!activeTeam?.id,
  })

  // Sync server myAvailability to local optimistic state
  useEffect(() => {
    if (data) {
      setMyAvailability(data.myAvailability)
    }
  }, [data?.myAvailability])

  const match = data?.match || null
  const displayMyAvailability = myAvailability !== null ? myAvailability : (data?.myAvailability ?? null)
  const availability = data?.availability || []

  const availMutation = useMutation<void, Error, AvailabilityStatus>({
    mutationFn: async (status: AvailabilityStatus) => {
      await supabase.from('match_availability').upsert({
        match_id: match!.id,
        player_id: user!.id,
        status,
        responded_at: new Date().toISOString()
      }, { onConflict: 'match_id,player_id' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchDetail', id, user?.id] })
    },
  })

  async function setAvail(status: AvailabilityStatus) {
    if (!match || !user) return
    setMyAvailability(status) // optimistic
    await availMutation.mutateAsync(status)
  }

  if (isLoading) {
    return <PageLoader />
  }

  if (!match) {
    return (
      <div className="p-4">
        <Link to="/matches" className="flex items-center gap-2 text-text-muted mb-4">
          <ArrowLeft size={18} /> Terug
        </Link>
        <p className="text-text-muted">Wedstrijd niet gevonden.</p>
      </div>
    )
  }

  const gatheringInfo = formatGatheringDisplay(match, teamSettings)
  const counts = STATUSES
    .map(def => ({
      ...def,
      countLabel: def.label.toLowerCase(),
      count: availability.filter(a => a.status === def.status).length,
    }))
    .filter(c => !c.adminOnly || c.count > 0)

  function handleShare() {
    const text = buildShareText(match!, gatheringInfo, data!.names, opponentName(match!.opponent))
    const url = buildWhatsAppUrl(text)
    window.open(url, '_blank')
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <Link to="/matches" className="flex items-center gap-2 text-text-muted hover:text-text">
          <ArrowLeft size={18} />
          <span className="text-sm">Terug</span>
        </Link>
        <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-secondary-soft hover:text-secondary-soft">
          <Share2 size={16} />
          Delen
        </button>
      </div>

      {/* Match header */}
      <div className="rounded-xl p-4 border bg-surface border-border">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
              style={{
                backgroundColor: match.is_home ? tint('--color-success', 20) : tint('--color-info', 20),
                color: match.is_home ? 'var(--color-success)' : 'var(--color-info)'
              }}>
          {match.is_home ? 'Thuiswedstrijd' : 'Uitwedstrijd'}
        </span>
        <h1 className="text-2xl font-bold">vs {opponentName(match.opponent)}</h1>
        <p className="text-text-muted mt-1">{formatDateLong(match.match_date)}</p>

        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5 text-text-soft">
            <Clock size={14} className="text-text-subtle" />
            Aanvang: <span className="font-medium">{formatTime(match.match_time)}</span>
          </div>
          {match.location && (
            <div className="flex items-center gap-1.5 text-text-soft">
              <MapPin size={14} className="text-text-subtle" />
              {match.location}
            </div>
          )}
        </div>

        {/* Gathering time */}
        {gatheringInfo && !gatheringInfo.isNtb && (
          <div className="mt-3 text-sm py-2 px-3 rounded-lg"
               style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderLeft: '3px solid var(--color-secondary)' }}>
            <span className="text-text-muted">Verzamelen: </span>
            <span className="font-semibold text-secondary-soft">{gatheringInfo.time}</span>
            <span className="text-text-soft ml-2 text-xs">{gatheringInfo.label}</span>
          </div>
        )}
      </div>

      {/* Availability section */}
      <div className="rounded-xl p-4 border bg-surface border-border">
        <h2 className="font-semibold mb-3">Jouw beschikbaarheid</h2>
        {data?.myOverridden && (
          <div className="text-xs text-secondary-soft bg-secondary-soft/10 border border-secondary-soft/20 rounded-lg px-3 py-1.5 mb-3">
            Aangepast door admin
          </div>
        )}
        <div className="flex gap-2 mb-4">
          {PLAYER_STATUSES.map(({ status, icon: Icon, shortLabel, active }) => (
            <button
              key={status}
              onClick={() => setAvail(status)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-xs font-medium transition-all ${
                displayMyAvailability === status ? active : 'border-border text-text-subtle hover:border-border-hover'
              }`}
            >
              <Icon size={20} />
              {shortLabel}
            </button>
          ))}
        </div>

        {/* Counts. Uitgeroosterd only shows once it applies to someone —
            before the squad is picked the line would always read 0. */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {counts.map(({ status, icon: Icon, text, countLabel, count }) => (
            <div key={status} className="flex items-center gap-1.5">
              <Icon size={14} className={text} />
              <span className={`${text} font-medium`}>{count}</span>
              <span className="text-text-muted">{countLabel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin links */}
      {isAdmin && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-subtle uppercase tracking-wide px-1">Beheer</p>
          <Link
            to={`/admin/matches/${id}/roster`}
            className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-border-hover bg-surface border-border"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-info" />
              <span className="font-medium text-sm">Selectie beheren</span>
            </div>
            <ArrowLeft size={18} className="text-text-subtle rotate-180" />
          </Link>
          <Link
            to={`/admin/matches/${id}/goals`}
            className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-border-hover bg-surface border-border"
          >
            <div className="flex items-center gap-3">
              <Target size={20} className="text-danger" />
              <span className="font-medium text-sm">Doelpunten & kaarten</span>
            </div>
            <ArrowLeft size={18} className="text-text-subtle rotate-180" />
          </Link>
        </div>
      )}
    </div>
  )
}
