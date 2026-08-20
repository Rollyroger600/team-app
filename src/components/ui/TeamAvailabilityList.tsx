import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../stores/useAuthStore'
import { useIsTeamAdmin } from '../../lib/permissions'
import { STATUSES, statusDot } from '../../lib/availability'
import type { AvailabilityStatus } from '../../types/app'

export interface AvailabilityMember {
  id: string
  name: string
}

interface TeamAvailabilityListProps {
  matchId: string
  members: AvailabilityMember[]
  /** player_id → status */
  statusMap: Record<string, string | null | undefined>
  /** Called after a successful change so the parent can refetch */
  onChanged: () => void
}

/**
 * Two-column roster showing each player's availability for a match.
 * Admins (team_admin / platform_admin) can tap any name to set or change that
 * player's status; for everyone else the list is read-only.
 */
export default function TeamAvailabilityList({
  matchId, members, statusMap, onChanged,
}: TeamAvailabilityListProps) {
  const { user } = useAuthStore()
  const canEdit = useIsTeamAdmin()
  const [editing, setEditing] = useState<AvailabilityMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function apply(status: AvailabilityStatus | null) {
    if (!editing) return
    setSaving(true)
    setError('')

    const isSelf = editing.id === user?.id
    const { error: err } = status
      ? await supabase.from('match_availability').upsert({
          match_id: matchId,
          player_id: editing.id,
          status,
          responded_at: new Date().toISOString(),
          // Flag admin overrides so the player sees "Aangepast door admin"
          overridden: !isSelf,
          set_by: user?.id ?? null,
        }, { onConflict: 'match_id,player_id' })
      : await supabase.from('match_availability')
          .delete()
          .eq('match_id', matchId)
          .eq('player_id', editing.id)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setEditing(null)
    onChanged()
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {members.map(member => {
          const status = statusMap[member.id]
          const isMe = member.id === user?.id
          const content = (
            <>
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusDot(status)}`} />
              <span className={`truncate ${isMe ? 'text-secondary-soft' : 'text-text-soft'}`}>{member.name}</span>
            </>
          )

          return canEdit ? (
            <button
              key={member.id}
              onClick={() => { setEditing(member); setError('') }}
              className="flex items-center gap-2 text-xs py-0.5 text-left rounded transition-colors hover:bg-white/5"
            >
              {content}
            </button>
          ) : (
            <div key={member.id} className="flex items-center gap-2 text-xs py-0.5">
              {content}
            </div>
          )
        })}
      </div>

      {/* Statuskiezer voor beheerders */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border p-4 space-y-2 bg-surface border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-1">
              <p className="font-semibold">{editing.name}</p>
              <p className="text-xs text-text-muted">Beschikbaarheid aanpassen</p>
            </div>

            {/* Admins get all four; 'Uitgeroosterd' is theirs alone (the DB
                trigger enforces that too, this list is only the UI half). */}
            {STATUSES.map(({ status, icon: Icon, label, active }) => {
              const isActive = statusMap[editing.id] === status
              return (
                <button
                  key={status}
                  onClick={() => apply(status)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                    isActive ? active : 'border-border text-text-muted hover:border-border-hover'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              )
            })}

            <button
              onClick={() => apply(null)}
              disabled={saving}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-50 border-border text-text-muted hover:border-border-hover"
            >
              <Trash2 size={16} />
              Wissen (geen antwoord)
            </button>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              onClick={() => setEditing(null)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm text-text-muted disabled:opacity-50"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </>
  )
}
