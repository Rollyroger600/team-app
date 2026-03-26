import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, MapPin, CheckCircle, XCircle, HelpCircle, Users, Share2, Target, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { formatDateLong, formatTime, buildWhatsAppUrl, buildShareText, getAvailabilityBg, getAvailabilityColor } from '../lib/utils'
import { formatGatheringDisplay } from '../lib/gathering'
import type { Match, AvailabilityStatus } from '../types/app'

interface MatchDetailData {
  match: Match | null
  myAvailability: AvailabilityStatus | null
  availability: { status: string; profiles: { full_name: string | null } | null }[]
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { user, isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const { teamSettings } = useTeamStore()
  const queryClient = useQueryClient()
  const [myAvailability, setMyAvailability] = useState<AvailabilityStatus | null>(null)

  const { data, isLoading } = useQuery<MatchDetailData>({
    queryKey: ['matchDetail', id, user?.id],
    queryFn: async (): Promise<MatchDetailData> => {
      const [matchRes, myAvRes, allAvRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id!).single(),
        supabase.from('match_availability').select('status').eq('match_id', id!).eq('player_id', user!.id).maybeSingle(),
        supabase.from('match_availability').select('status, profiles(full_name)').eq('match_id', id!)
      ])
      return {
        match: matchRes.data || null,
        myAvailability: (myAvRes.data?.status as AvailabilityStatus | null) || null,
        availability: (allAvRes.data || []) as MatchDetailData['availability'],
      }
    },
    enabled: !!id && !!user?.id,
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
        <Link to="/matches" className="flex items-center gap-2 text-slate-400 mb-4">
          <ArrowLeft size={18} /> Terug
        </Link>
        <p className="text-slate-400">Wedstrijd niet gevonden.</p>
      </div>
    )
  }

  const gatheringInfo = formatGatheringDisplay(match, teamSettings)
  const available = availability.filter(a => a.status === 'available').length
  const unavailable = availability.filter(a => a.status === 'unavailable').length
  const maybe = availability.filter(a => a.status === 'maybe').length

  function handleShare() {
    const text = buildShareText(match!, gatheringInfo)
    const url = buildWhatsAppUrl(text)
    window.open(url, '_blank')
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <Link to="/matches" className="flex items-center gap-2 text-slate-400 hover:text-slate-200">
          <ArrowLeft size={18} />
          <span className="text-sm">Terug</span>
        </Link>
        <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300">
          <Share2 size={16} />
          Delen
        </button>
      </div>

      {/* Match header */}
      <div className="rounded-xl p-4 border bg-surface border-border">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
              style={{
                backgroundColor: match.is_home ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)',
                color: match.is_home ? '#34d399' : '#a5b4fc'
              }}>
          {match.is_home ? 'Thuiswedstrijd' : 'Uitwedstrijd'}
        </span>
        <h1 className="text-2xl font-bold">vs {match.opponent}</h1>
        <p className="text-slate-400 mt-1">{formatDateLong(match.match_date)}</p>

        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock size={14} className="text-slate-500" />
            Aanvang: <span className="font-medium">{formatTime(match.match_time)}</span>
          </div>
          {match.location && (
            <div className="flex items-center gap-1.5 text-slate-300">
              <MapPin size={14} className="text-slate-500" />
              {match.location}
            </div>
          )}
        </div>

        {/* Gathering time */}
        {gatheringInfo && !gatheringInfo.isNtb && (
          <div className="mt-3 text-sm py-2 px-3 rounded-lg"
               style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderLeft: '3px solid var(--color-secondary)' }}>
            <span className="text-slate-400">Verzamelen: </span>
            <span className="font-semibold text-amber-400">{gatheringInfo.time}</span>
            <span className="text-slate-300 ml-2 text-xs">{gatheringInfo.label}</span>
          </div>
        )}
      </div>

      {/* Availability section */}
      <div className="rounded-xl p-4 border bg-surface border-border">
        <h2 className="font-semibold mb-3">Jouw beschikbaarheid</h2>
        <div className="flex gap-2 mb-4">
          {([
            { status: 'available' as const, icon: CheckCircle, label: 'Beschikbaar', color: 'bg-green-500/20 border-green-500/50 text-green-400' },
            { status: 'unavailable' as const, icon: XCircle, label: 'Niet', color: 'bg-red-500/20 border-red-500/50 text-red-400' },
            { status: 'maybe' as const, icon: HelpCircle, label: 'Misschien', color: 'bg-amber-500/20 border-amber-500/50 text-amber-400' },
          ]).map(({ status, icon: Icon, label, color }) => (
            <button
              key={status}
              onClick={() => setAvail(status)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-xs font-medium transition-all ${
                displayMyAvailability === status ? color : 'border-slate-700 text-slate-500 hover:border-slate-500'
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>

        {/* Counts */}
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-green-400 font-medium">{available}</span>
            <span className="text-slate-400">beschikbaar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle size={14} className="text-red-400" />
            <span className="text-red-400 font-medium">{unavailable}</span>
            <span className="text-slate-400">niet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HelpCircle size={14} className="text-amber-400" />
            <span className="text-amber-400 font-medium">{maybe}</span>
            <span className="text-slate-400">misschien</span>
          </div>
        </div>
      </div>

      {/* Lineup link */}
      <Link
        to={`/matches/${id}/lineup`}
        className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-slate-500 bg-surface border-border"
      >
        <div className="flex items-center gap-3">
          <Users size={20} className="text-slate-400" />
          <span className="font-medium">Bekijk opstelling</span>
        </div>
        <ArrowLeft size={18} className="text-slate-500 rotate-180" />
      </Link>

      {/* Admin links */}
      {isAdmin && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Beheer</p>
          <Link
            to={`/admin/matches/${id}/roster`}
            className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-slate-500 bg-surface border-border"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-blue-400" />
              <span className="font-medium text-sm">Selectie beheren</span>
            </div>
            <ArrowLeft size={18} className="text-slate-500 rotate-180" />
          </Link>
          <Link
            to={`/admin/matches/${id}/goals`}
            className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-slate-500 bg-surface border-border"
          >
            <div className="flex items-center gap-3">
              <Target size={20} className="text-red-400" />
              <span className="font-medium text-sm">Doelpunten & kaarten</span>
            </div>
            <ArrowLeft size={18} className="text-slate-500 rotate-180" />
          </Link>
        </div>
      )}
    </div>
  )
}
