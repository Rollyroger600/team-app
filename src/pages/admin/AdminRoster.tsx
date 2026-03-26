import React from 'react'
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Check, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import type { Match, Profile } from '../../types/app'

interface AvailabilityItem {
  player_id: string
  status: string
  profiles: Pick<Profile, 'full_name' | 'nickname' | 'jersey_number' | 'position'> | null
}

interface RosterQueryData {
  match: Match | null
  availability: AvailabilityItem[]
  rosterIds: string[]
}

export default function AdminRoster(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [roster, setRoster] = useState<string[]>([])
  const [rosterInitialized, setRosterInitialized] = useState(false)

  const { data, isLoading } = useQuery<RosterQueryData>({
    queryKey: ['adminRoster', id, activeTeam?.id],
    queryFn: async (): Promise<RosterQueryData> => {
      const [matchRes, availRes, rosterRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id!).single(),
        supabase.from('match_availability')
          .select('player_id, status, profiles(full_name, nickname, jersey_number, position)')
          .eq('match_id', id!)
          .eq('status', 'available'),
        supabase.from('match_roster')
          .select('player_id, sort_order')
          .eq('match_id', id!)
      ])
      return {
        match: matchRes.data as Match | null,
        availability: (availRes.data as unknown as AvailabilityItem[]) || [],
        rosterIds: (rosterRes.data as { player_id: string }[] | null)?.map(r => r.player_id) || [],
      }
    },
    enabled: !!id && !!activeTeam?.id,
  })

  // Initialize roster from server on first load only
  useEffect(() => {
    if (data && !rosterInitialized) {
      setRoster(data.rosterIds)
      setRosterInitialized(true)
    }
  }, [data, rosterInitialized])

  const match = data?.match || null
  const availability = data?.availability || []

  const saveRosterMutation = useMutation<void, Error, string[]>({
    mutationFn: async (rosterList: string[]): Promise<void> => {
      await supabase.from('match_roster').delete().eq('match_id', id!)
      if (rosterList.length > 0) {
        await supabase.from('match_roster').insert(
          rosterList.map((playerId, index) => ({
            match_id: id!,
            player_id: playerId,
            sort_order: index + 1
          }))
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRoster', id, activeTeam?.id] })
    },
  })

  function togglePlayer(playerId: string): void {
    setRoster(prev =>
      prev.includes(playerId)
        ? prev.filter(pid => pid !== playerId)
        : [...prev, playerId]
    )
  }

  async function saveRoster(): Promise<void> {
    await saveRosterMutation.mutateAsync(roster)
  }

  if (isLoading) {
    return <PageLoader />
  }

  const saving = saveRosterMutation.isPending

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Opstelling</h1>
          {match && <p className="text-slate-400 text-sm">vs {match.opponent}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{roster.length} spelers geselecteerd</p>
        <button
          onClick={saveRoster}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 bg-secondary text-secondary-text"
        >
          {saving ? 'Opslaan...' : 'Opstelling opslaan'}
        </button>
      </div>

      {availability.length === 0 ? (
        <EmptyState icon={Users}>Geen beschikbare spelers</EmptyState>
      ) : (
        <div className="space-y-2">
          {availability.map((item) => {
            const isSelected = roster.includes(item.player_id)
            return (
              <button
                key={item.player_id}
                onClick={() => togglePlayer(item.player_id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left"
                style={{
                  backgroundColor: isSelected ? 'rgba(16,185,129,0.1)' : 'var(--color-surface)',
                  borderColor: isSelected ? 'rgba(16,185,129,0.5)' : 'var(--color-border)'
                }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-green-500 text-white' : 'border border-slate-600 text-slate-500'
                }`}>
                  {isSelected ? <Check size={14} /> : <X size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {item.profiles?.nickname || item.profiles?.full_name?.split(' ')[0]}
                    {item.profiles?.nickname && (
                      <span className="text-slate-500 font-normal text-sm ml-1">
                        {item.profiles.full_name}
                      </span>
                    )}
                  </p>
                  {item.profiles?.position && (
                    <p className="text-xs text-slate-500 capitalize">{
                      ({ goalkeeper: 'Keeper', defender: 'Verdediger', midfielder: 'Middenvelder', forward: 'Aanvaller' } as Record<string, string>)[item.profiles.position] || item.profiles.position
                    }</p>
                  )}
                </div>
                {item.profiles?.jersey_number && (
                  <span className="text-slate-400 text-sm">#{item.profiles.jersey_number}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
