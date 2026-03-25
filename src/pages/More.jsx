import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, XCircle, HelpCircle, Settings, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { formatDate, formatTime } from '../lib/utils'

const STATUS_OPTIONS = [
  { status: 'available',   icon: CheckCircle, label: 'Ja',        active: 'bg-green-500/25 border-green-500/60 text-green-400' },
  { status: 'unavailable', icon: XCircle,     label: 'Nee',       active: 'bg-red-500/25 border-red-500/60 text-red-400' },
  { status: 'maybe',       icon: HelpCircle,  label: 'Misschien', active: 'bg-amber-500/25 border-amber-500/60 text-amber-400' },
]

const STATUS_DOT = {
  available:   'bg-green-400',
  unavailable: 'bg-red-400',
  maybe:       'bg-amber-400',
}

function AvailabilityDot({ status }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status] || 'bg-slate-600'}`} />
  )
}

export default function More() {
  const { user, isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(new Set())
  const [saving, setSaving] = useState(null)
  const [myAvail, setMyAvail] = useState({})     // optimistic: match_id → status
  const [allAvail, setAllAvail] = useState({})   // optimistic: match_id → [{player_id, status}]

  const { data, isLoading } = useQuery({
    queryKey: ['matches', activeTeam?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]

      const [matchRes, membersRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, opponent, match_date, match_time, is_home, status')
          .eq('team_id', activeTeam.id)
          .gte('match_date', today)
          .order('match_date', { ascending: true }),
        supabase
          .from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam.id)
          .eq('active', true),
      ])

      const matchList = matchRes.data || []
      const memberList = (membersRes.data || []).map(m => ({
        id: m.player_id,
        name: m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?',
      }))

      let myAvailMap = {}
      let allAvailMap = {}

      if (matchList.length > 0) {
        const [myAvRes, allAvRes] = await Promise.all([
          supabase
            .from('match_availability')
            .select('match_id, status')
            .eq('player_id', user.id),
          supabase
            .from('match_availability')
            .select('match_id, player_id, status')
            .in('match_id', matchList.map(m => m.id)),
        ])

        for (const a of myAvRes.data || []) myAvailMap[a.match_id] = a.status

        for (const a of allAvRes.data || []) {
          if (!allAvailMap[a.match_id]) allAvailMap[a.match_id] = []
          allAvailMap[a.match_id].push(a)
        }
      }

      return { matches: matchList, members: memberList, myAvailMap, allAvailMap }
    },
    enabled: !!activeTeam?.id && !!user?.id,
  })

  // Sync availability from server (after invalidation)
  useEffect(() => {
    if (data) {
      setMyAvail(data.myAvailMap)
      setAllAvail(data.allAvailMap)
    }
  }, [data])

  const matches = data?.matches || []
  const members = data?.members || []

  const availMutation = useMutation({
    mutationFn: async ({ matchId, next }) => {
      if (next) {
        return supabase.from('match_availability').upsert(
          { match_id: matchId, player_id: user.id, status: next, responded_at: new Date().toISOString() },
          { onConflict: 'match_id,player_id' }
        )
      } else {
        return supabase.from('match_availability')
          .delete()
          .eq('match_id', matchId)
          .eq('player_id', user.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches', activeTeam?.id] })
    },
  })

  async function setStatus(matchId, status) {
    const current = myAvail[matchId]
    const next = current === status ? null : status

    setSaving(matchId + status)
    setMyAvail(prev => ({ ...prev, [matchId]: next }))

    // Update allAvail ook lokaal
    setAllAvail(prev => {
      const list = (prev[matchId] || []).filter(a => a.player_id !== user.id)
      if (next) list.push({ player_id: user.id, status: next })
      return { ...prev, [matchId]: list }
    })

    await availMutation.mutateAsync({ matchId, next })
    setSaving(null)
  }

  function toggleExpand(matchId) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Beschikbaarheid</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin"
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors hover:border-amber-500/40 hover:text-amber-400 border-border text-text-muted"
              title="Admin"
            >
              <ShieldCheck size={16} />
            </Link>
          )}
          <Link to="/settings"
            className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors hover:border-slate-500 border-border text-text-muted"
            title="Instellingen"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : matches.length === 0 ? (
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <p className="text-slate-400">Geen aankomende wedstrijden</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-surface border-border">
          {matches.map((match, i) => {
            const myStatus = myAvail[match.id] || null
            const isSaving = saving?.startsWith(match.id)
            const isExpanded = expanded.has(match.id)
            const matchAvail = allAvail[match.id] || []
            const availCount = matchAvail.filter(a => a.status === 'available').length
            const totalMembers = members.length

            // Bouw ledenlijst met status
            const memberAvailMap = {}
            for (const a of matchAvail) memberAvailMap[a.player_id] = a.status

            return (
              <div key={match.id}
                   className={`${i < matches.length - 1 ? 'border-b' : ''} border-border`}>
                {/* Hoofdrij */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{formatDate(match.match_date)} • {formatTime(match.match_time)}</p>
                    <p className="font-medium text-sm truncate">
                      {match.is_home ? 'Thuis' : 'Uit'} vs {match.opponent}
                    </p>
                  </div>

                  {/* Snelle knoppen */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {STATUS_OPTIONS.map(({ status, icon: Icon, label, active }) => {
                      const isActive = myStatus === status
                      return (
                        <button
                          key={status}
                          onClick={() => !isSaving && setStatus(match.id, status)}
                          disabled={!!saving}
                          title={label}
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                            isActive ? active : 'border-slate-700 text-slate-500 hover:border-slate-500'
                          }`}
                        >
                          <Icon size={15} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Uitklap-balk */}
                <button
                  onClick={() => toggleExpand(match.id)}
                  className="w-full flex items-center justify-between px-4 pb-2.5 text-xs transition-colors hover:text-slate-300 text-text-muted"
                >
                  <span>
                    <span className={availCount >= 11 ? 'text-green-400 font-semibold' : availCount >= 8 ? 'text-amber-400 font-semibold' : 'text-red-400 font-semibold'}>
                      {availCount}
                    </span>
                    /{totalMembers} beschikbaar
                  </span>
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {/* Uitgeklaptelijst */}
                {isExpanded && (
                  <div className="border-t mx-4 mb-3 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-border">
                    {members.map(member => {
                      const status = memberAvailMap[member.id]
                      return (
                        <div key={member.id} className="flex items-center gap-2 text-xs py-0.5">
                          <AvailabilityDot status={status} />
                          <span className={`truncate ${member.id === user.id ? 'text-amber-400' : 'text-slate-300'}`}>
                            {member.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
