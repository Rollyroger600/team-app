import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dumbbell, Users, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeInvalidate } from '../../lib/realtime'
import { PLAYER_STATUSES, statusLabelFor, statusDot } from '../../lib/availability'
import { formatTrainingDate, formatTime, type Training } from '../../lib/trainings'
import { tint } from '../../lib/utils'

/**
 * Eén training met "wie komt er trainen", voor Home en Meer.
 *
 * Zelfde vorm als de wedstrijdkaart op Home: jouw antwoord bovenaan, de stand van
 * het team eronder uitklapbaar. Labels lopen via statusLabelFor(..., 'training'),
 * dus hier staat "Aanwezig/Afwezig" waar een wedstrijd "Beschikbaar" zegt.
 */

interface TrainingCardProps {
  training: Training
  teamId: string
  playerId: string
}

type Status = 'available' | 'unavailable' | 'injured'

interface AttendanceRow {
  player_id: string
  status: Status
}

interface MemberRow {
  player_id: string
  profiles: { full_name: string | null; nickname: string | null } | null
}

/** Zelfde afleiding als Dashboard en TeamAvailabilityList: bijnaam, anders de
 *  voornaam. */
function memberName(m: MemberRow): string {
  return m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?'
}

export default function TrainingCard({ training, teamId, playerId }: TrainingCardProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<Status | null>(null)

  const queryKey = ['trainingAttendance', training.id]
  useRealtimeInvalidate('training_attendance', queryKey, true)

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const [attendanceRes, membersRes] = await Promise.all([
        supabase
          .from('training_attendance')
          .select('player_id, status')
          .eq('training_id', training.id),
        // Namen via team_memberships, niet via een profiles-embed op
        // training_attendance: die tabel heeft twee FK's naar profiles
        // (player_id en set_by) en een kale embed laat PostgREST de hele query
        // stil weigeren. Zelfde valkuil als bij match_availability.
        supabase
          .from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', teamId)
          .eq('active', true),
      ])
      const members = ((membersRes.data || []) as unknown as MemberRow[])
        .map(m => ({ id: m.player_id, name: memberName(m) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
      return {
        rows: (attendanceRes.data || []) as unknown as AttendanceRow[],
        members,
      }
    },
  })

  const rows = data?.rows ?? []
  const members = data?.members ?? []

  const byPlayer: Record<string, Status> = {}
  for (const r of rows) byPlayer[r.player_id] = r.status

  const mine = optimistic ?? byPlayer[playerId] ?? null
  const aanwezig = rows.filter(r => r.status === 'available').length
  const onbekend = members.length - rows.length

  async function setStatus(status: Status) {
    setOptimistic(status)
    await supabase.from('training_attendance').upsert({
      training_id: training.id,
      player_id: playerId,
      status,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'training_id,player_id' })
    queryClient.invalidateQueries({ queryKey })
  }

  return (
    <div className="rounded-xl border p-4 bg-surface border-border">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide flex items-center gap-1.5 text-text-muted">
            <Dumbbell size={12} /> Training
          </p>
          <p className="font-bold text-lg leading-tight">{formatTrainingDate(training.training_date)}</p>
          <p className="text-sm text-text-muted">
            {formatTime(training.start_time)}
            {training.end_time && `–${formatTime(training.end_time)}`}
          </p>
          {training.location && (
            <p className="text-xs flex items-center gap-1 mt-0.5 text-text-subtle">
              <MapPin size={11} /> {training.location}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-text-muted mb-2">Kom je trainen?</p>
      <div className="flex gap-2 mb-3">
        {PLAYER_STATUSES.map(({ status, icon: Icon, active }) => (
          <button
            key={status}
            onClick={() => setStatus(status as Status)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
              mine === status
                ? active + ' ring-2 ring-offset-1 ring-offset-transparent'
                : 'border-border text-text-subtle hover:border-border-hover'
            }`}
          >
            <Icon size={18} />
            <span className="hidden sm:block">{statusLabelFor(status, 'training')}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-xs pt-2 border-t transition-colors hover:text-text-soft border-border text-text-muted"
      >
        <span className="flex items-center gap-1.5">
          <Users size={13} />
          <span>
            <span className="text-success font-semibold">{aanwezig}</span>
            /{members.length} aanwezig
            {onbekend > 0 && <span className="text-text-subtle"> · {onbekend} niet gereageerd</span>}
          </span>
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {members.map(m => {
            const s = byPlayer[m.id]
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 text-xs py-1 px-2 rounded"
                style={{ backgroundColor: m.id === playerId ? tint('--color-secondary', 8) : 'transparent' }}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(s)}`} />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-text-subtle">{statusLabelFor(s, 'training', 'Nog niet')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
