import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { formatDate } from '../../lib/utils'
import type { Profile } from '../../types/app'

interface ScoreItem {
  id: string
  player_id: string
  points: number
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface SessionItem {
  id: string
  session_date: string
  scores: ScoreItem[]
}

interface PlayerItem {
  player_id: string
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface PotjescupQueryData {
  sessions: SessionItem[]
  players: PlayerItem[]
}

const POINT_OPTIONS = [0, 0.5, 1] as const

export default function AdminPotjescup(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<PotjescupQueryData>({
    queryKey: ['adminPotjescup', activeTeam?.id],
    queryFn: async (): Promise<PotjescupQueryData> => {
      const [sessionsRes, playersRes] = await Promise.all([
        supabase.from('potjescup_sessions')
          .select('id, session_date, scores:potjescup_scores(id, player_id, points, profiles(full_name, nickname))')
          .eq('team_id', activeTeam!.id)
          .order('session_date', { ascending: false }),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      return {
        sessions: (sessionsRes.data as unknown as SessionItem[]) || [],
        players: (playersRes.data as unknown as PlayerItem[]) || [],
      }
    },
    enabled: !!activeTeam?.id,
  })

  const sessions = data?.sessions || []
  const players = data?.players || []

  function invalidateAll(): void {
    queryClient.invalidateQueries({ queryKey: ['adminPotjescup', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['potjescupStats', activeTeam?.id] })
  }

  const updatePointsMutation = useMutation<void, Error, { scoreId: string; points: number }>({
    mutationFn: async ({ scoreId, points }): Promise<void> => {
      await supabase.from('potjescup_scores').update({ points }).eq('id', scoreId)
    },
    onSuccess: invalidateAll,
  })

  const deleteSessionMutation = useMutation<void, Error, string>({
    mutationFn: async (sessionId: string): Promise<void> => {
      await supabase.from('potjescup_sessions').delete().eq('id', sessionId)
    },
    onSuccess: invalidateAll,
  })

  async function createSession(): Promise<void> {
    if (!newDate || !activeTeam || players.length === 0) return
    setCreating(true)

    const { data: session, error } = await supabase
      .from('potjescup_sessions')
      .insert({ team_id: activeTeam.id, session_date: newDate })
      .select('id')
      .single()

    if (!error && session) {
      await supabase.from('potjescup_scores').insert(
        players.map(p => ({ session_id: session.id, player_id: p.player_id, points: 0 }))
      )
    }

    setCreating(false)
    invalidateAll()
  }

  async function setPoints(scoreId: string, points: number): Promise<void> {
    await updatePointsMutation.mutateAsync({ scoreId, points })
  }

  async function deleteSession(sessionId: string): Promise<void> {
    await deleteSessionMutation.mutateAsync(sessionId)
  }

  const playerName = (p: { profiles: Pick<Profile, 'full_name' | 'nickname'> | null }): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Potjescup</h1>
      </div>

      {/* Nieuwe training toevoegen */}
      <div className="rounded-xl p-4 border space-y-2 bg-surface border-border">
        <p className="text-sm text-text-muted">
          Voeg een training toe om na de eindpartij punten toe te kennen aan alle spelers.
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
            style={{ border: '1px solid var(--color-border)' }}
          />
          <button
            onClick={createSession}
            disabled={creating || !newDate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
          >
            <Plus size={16} />
            {creating ? 'Bezig...' : 'Toevoegen'}
          </button>
        </div>
      </div>

      {/* Trainingen met puntentoekenning */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Trophy}>Nog geen trainingen. Voeg er hierboven een toe.</EmptyState>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="rounded-xl border overflow-hidden bg-surface border-border">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="font-semibold text-sm">{formatDate(session.session_date)}</p>
                <button onClick={() => deleteSession(session.id)}
                        className="text-text-faint hover:text-danger transition-colors p-1 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {session.scores.map(score => (
                <div key={score.id}
                     className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <span className="flex-1 text-sm font-medium truncate">{playerName(score)}</span>
                  <div className="flex gap-1">
                    {POINT_OPTIONS.map(pt => (
                      <button
                        key={pt}
                        onClick={() => setPoints(score.id, pt)}
                        className={`w-10 h-8 rounded-lg text-xs font-semibold transition-colors ${
                          score.points === pt
                            ? 'bg-secondary text-secondary-text'
                            : 'bg-surface-2 text-text-muted hover:text-text'
                        }`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
