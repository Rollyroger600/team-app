import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import { changePlayerRole } from '../../lib/auth'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import type { Profile } from '../../types/app'

interface PlayerMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin'
  active: boolean
  profiles: Pick<Profile, 'id' | 'full_name' | 'display_name' | 'jersey_number'> | null
}

export default function AdminRoles(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const { isClubAdmin } = useAuthStore()
  const queryClient = useQueryClient()
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const canChangeRoles = isClubAdmin()

  const { data: players = [], isLoading } = useQuery<PlayerMembership[]>({
    queryKey: ['adminRoles', activeTeam?.id],
    queryFn: async (): Promise<PlayerMembership[]> => {
      const { data } = await supabase
        .from('team_memberships')
        .select('*, profiles(id, full_name, display_name, jersey_number)')
        .eq('team_id', activeTeam!.id)
        .eq('active', true)
        .order('created_at', { ascending: true })
      return (data as unknown as PlayerMembership[]) || []
    },
    enabled: !!activeTeam?.id,
  })

  async function handleToggleRole(membership: PlayerMembership) {
    if (!canChangeRoles || !activeTeam?.id) return
    const newRole = membership.role === 'team_admin' ? 'player' : 'team_admin'
    setChangingRole(membership.player_id)
    const result = await changePlayerRole(membership.player_id, activeTeam.id, newRole)
    setChangingRole(null)
    if (result.error) {
      setErrors(prev => ({ ...prev, [membership.player_id]: result.error! }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[membership.player_id]; return n }), 4000)
    } else {
      queryClient.invalidateQueries({ queryKey: ['adminRoles', activeTeam?.id] })
    }
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Rollen</h1>
      </div>

      {!canChangeRoles && (
        <div className="text-sm text-text-muted px-1">
          Je kunt rollen bekijken maar niet wijzigen. Alleen club-admins kunnen rollen aanpassen.
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
        <EmptyState icon={ShieldCheck}>Geen spelers gevonden</EmptyState>
      ) : (
        <div className="space-y-2">
          {players.map((membership) => {
            const p = membership.profiles
            const err = errors[membership.player_id]
            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-4 rounded-xl border bg-surface border-border">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary">
                  {p?.jersey_number || p?.display_name?.[0]?.toUpperCase() || p?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {p?.display_name || p?.full_name || 'Onbekend'}
                  </p>
                  {err && <p className="text-xs text-red-400 mt-0.5">{err}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: membership.role === 'team_admin' ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.2)',
                          color: membership.role === 'team_admin' ? '#f59e0b' : '#94a3b8'
                        }}>
                    {membership.role === 'team_admin' ? 'Admin' : 'Speler'}
                  </span>
                  {canChangeRoles && (
                    <button
                      onClick={() => handleToggleRole(membership)}
                      disabled={changingRole === membership.player_id}
                      className="text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 border-border hover:border-amber-400 hover:text-amber-400 text-text-muted"
                    >
                      {changingRole === membership.player_id
                        ? '...'
                        : membership.role === 'team_admin' ? 'Maak speler' : 'Maak admin'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
