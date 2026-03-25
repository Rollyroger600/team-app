import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import { formatDate, formatTime } from '../lib/utils'

// Volgorde op veld: aanvallers bovenin, keeper onderin
const ROWS = [
  { key: 'forward',    label: 'Aanvallers',   max: 3,  color: '#ef4444' },
  { key: 'midfielder', label: 'Middenvelders', max: 4,  color: '#10b981' },
  { key: 'defender',   label: 'Verdedigers',  max: 4,  color: '#3b82f6' },
  { key: 'goalkeeper', label: 'Keeper',       max: 1,  color: '#f59e0b' },
]
const POSITION_CYCLE = ['forward', 'midfielder', 'defender', 'goalkeeper']
const POSITION_LABELS = {
  goalkeeper: 'Keeper', defender: 'Verdediger',
  midfielder: 'Middenvelder', forward: 'Aanvaller',
}

function displayName(p) {
  return p.profiles?.nickname || p.profiles?.full_name?.split(' ')[0] || '?'
}

function PlayerChip({ player, isAdmin, onCycle, small = false }) {
  const pos = player.position_in_lineup
  const row = ROWS.find(r => r.key === pos)
  const color = row?.color || '#64748b'
  const name = displayName(player)
  const num = player.profiles?.jersey_number

  return (
    <button
      onClick={() => isAdmin && onCycle(player.player_id)}
      disabled={!isAdmin}
      title={isAdmin ? `Klik om positie te wijzigen (nu: ${POSITION_LABELS[pos] || '?'})` : name}
      className={`flex flex-col items-center gap-0.5 ${isAdmin ? 'cursor-pointer active:scale-95' : 'cursor-default'} transition-transform select-none`}
      style={{ minWidth: small ? 36 : 44 }}
    >
      <div
        className={`${small ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-xs'} rounded-full flex items-center justify-center font-bold border-2 shadow-md`}
        style={{ backgroundColor: color + '28', borderColor: color, color }}
      >
        {num ? `${num}` : name[0]?.toUpperCase()}
      </div>
      <span className={`${small ? 'text-xs' : 'text-xs'} font-medium text-white leading-tight text-center truncate`}
            style={{ maxWidth: small ? 36 : 44 }}>
        {name}
      </span>
    </button>
  )
}

export default function MatchLineup() {
  const { id } = useParams()
  const { isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const queryClient = useQueryClient()

  const [positions, setPositions] = useState({})   // player_id → position key
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['matchLineup', id],
    queryFn: async () => {
      const [matchRes, rosterRes, availRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id).single(),
        supabase.from('match_roster')
          .select('player_id, position_in_lineup, roster_status, sort_order, profiles(full_name, nickname, jersey_number, position)')
          .eq('match_id', id),
        supabase.from('match_availability')
          .select('player_id, status, profiles(full_name, nickname, jersey_number, position)')
          .eq('match_id', id),
      ])

      const rosterList = rosterRes.data || []
      const rosterIds = new Set(rosterList.map(r => r.player_id))

      const posMap = {}
      for (const r of rosterList) {
        posMap[r.player_id] = r.position_in_lineup || r.profiles?.position || 'midfielder'
      }

      const allAvail = availRes.data || []
      return {
        match: matchRes.data,
        roster: rosterList,
        posMap,
        available: allAvail.filter(a => a.status === 'available' && !rosterIds.has(a.player_id)),
        absent: allAvail.filter(a => a.status !== 'available'),
      }
    },
    enabled: !!id,
  })

  // Sync positions from server data
  useEffect(() => {
    if (data?.posMap) {
      setPositions(data.posMap)
    }
  }, [data?.posMap])

  const match = data?.match || null
  const roster = data?.roster || []
  const available = data?.available || []
  const absent = data?.absent || []

  const saveMutation = useMutation({
    mutationFn: (updates) =>
      supabase.from('match_roster').upsert(updates, { onConflict: 'match_id,player_id' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchLineup', id] })
    },
  })

  function cyclePosition(playerId) {
    setPositions(prev => {
      const current = prev[playerId] || 'midfielder'
      const idx = POSITION_CYCLE.indexOf(current)
      const next = POSITION_CYCLE[(idx + 1) % POSITION_CYCLE.length]
      return { ...prev, [playerId]: next }
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const updates = roster.map(r => ({
      match_id: id,
      player_id: r.player_id,
      position_in_lineup: positions[r.player_id] || r.profiles?.position || 'midfielder',
      roster_status: r.roster_status || 'starting',
      sort_order: r.sort_order,
    }))
    await saveMutation.mutateAsync(updates)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) {
    return <PageLoader />
  }

  // Groepeer roster per positierij
  const byRow = {}
  for (const row of ROWS) byRow[row.key] = []
  for (const r of roster) {
    const pos = positions[r.player_id] || 'midfielder'
    if (byRow[pos]) byRow[pos].push(r)
  }

  const hasRoster = roster.length > 0

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link to={`/matches/${id}`} className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Opstelling</h1>
          {match && (
            <p className="text-slate-400 text-sm truncate">
              vs {match.opponent} · {formatDate(match.match_date)} {formatTime(match.match_time)}
            </p>
          )}
        </div>
        {isAdmin && hasRoster && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
            style={{ backgroundColor: saved ? '#10b981' : 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
          >
            <Save size={14} />
            {saving ? 'Opslaan...' : saved ? 'Opgeslagen' : 'Opslaan'}
          </button>
        )}
      </div>

      {!hasRoster ? (
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <p className="text-slate-400 text-sm">
            {isAdmin
              ? 'Stel eerst de selectie in via Admin → Wedstrijd → Selectie.'
              : 'De opstelling is nog niet beschikbaar.'}
          </p>
          {isAdmin && (
            <Link
              to={`/admin/matches/${id}/roster`}
              className="inline-block mt-3 px-4 py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text"
            >
              Selectie instellen
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Hockey veld */}
          <div
            className="rounded-2xl overflow-hidden relative"
            style={{
              background: 'linear-gradient(180deg, #166534 0%, #15803d 40%, #166534 100%)',
              border: '2px solid #14532d',
              minHeight: 340,
            }}
          >
            {/* Middenlijn */}
            <div className="absolute left-4 right-4 border-t border-white/20" style={{ top: '50%' }} />
            {/* Cirkel */}
            <div className="absolute border border-white/20 rounded-full"
                 style={{ width: 80, height: 80, top: 'calc(50% - 40px)', left: 'calc(50% - 40px)' }} />

            <div className="relative z-10 flex flex-col justify-around py-5 px-2" style={{ minHeight: 340 }}>
              {ROWS.map(row => {
                const players = byRow[row.key] || []
                return (
                  <div key={row.key} className="flex items-center justify-center gap-3 flex-wrap">
                    {players.length > 0 ? (
                      players.map(r => (
                        <PlayerChip
                          key={r.player_id}
                          player={{ ...r, position_in_lineup: positions[r.player_id] || row.key }}
                          isAdmin={isAdmin}
                          onCycle={cyclePosition}
                        />
                      ))
                    ) : (
                      <span className="text-xs text-white/30 italic">{row.label}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {isAdmin && (
            <p className="text-xs text-slate-500 text-center -mt-2">
              Tik op een speler om zijn positierij te wijzigen
            </p>
          )}

          {/* Bank / beschikbaar maar niet in selectie */}
          {available.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-surface border-border">
              <div className="px-4 py-2.5 border-b text-xs font-semibold text-slate-400 uppercase tracking-wide border-border">
                Beschikbaar, niet in selectie
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-3">
                {available.map(a => (
                  <div key={a.player_id} className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border bg-surface-2 border-border text-text-muted">
                      {a.profiles?.jersey_number || displayName(a)[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-400 truncate" style={{ maxWidth: 44 }}>
                      {displayName(a)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Afwezig */}
          {absent.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-surface border-border">
              <div className="px-4 py-2.5 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide border-border">
                Afwezig / geen opgave
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {absent.map(a => (
                  <span key={a.player_id}
                        className="px-2.5 py-1 rounded-full text-xs bg-surface-2 text-text-muted">
                    {displayName(a)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
