import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Trash2, ChevronDown, Check, AlertCircle, Calendar, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'

function emptyRow(matchday) {
  return { _id: crypto.randomUUID(), matchday, date: '', time: '', home_team_id: '', away_team_id: '' }
}

function buildRows(matchday, count = 6) {
  return Array.from({ length: count }, () => emptyRow(matchday))
}

// --- Team select ---
function TeamSelect({ value, onChange, teams, placeholder, ownTeamId }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm outline-none"
        style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: value ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      >
        <option value="">{placeholder}</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.id === ownTeamId ? `★ ${t.display_name}` : t.display_name}</option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-40" />
    </div>
  )
}

// --- Match row ---
function MatchRow({ row, teams, ownTeamId, matchdayDate, onChange, onRemove }) {
  const isOwn = row.home_team_id === ownTeamId || row.away_team_id === ownTeamId
  // Show matchday date as placeholder if row has no own date
  const dateValue = row.date

  return (
    <div
      className={`grid gap-2 items-center rounded-xl p-3 border ${isOwn ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
      style={{ gridTemplateColumns: '1fr 1fr 90px 72px 28px', ...(!isOwn ? { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' } : {}) }}
    >
      <TeamSelect value={row.home_team_id} onChange={(v) => onChange(row._id, 'home_team_id', v)} teams={teams} placeholder="Thuis" ownTeamId={ownTeamId} />
      <TeamSelect value={row.away_team_id} onChange={(v) => onChange(row._id, 'away_team_id', v)} teams={teams} placeholder="Uit" ownTeamId={ownTeamId} />

      {/* Datum — valt terug op speelronde-datum als leeg */}
      <div className="relative">
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onChange(row._id, 'date', e.target.value)}
          className="w-full rounded-lg border px-2 py-2 text-xs outline-none"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            borderColor: dateValue ? 'var(--color-border)' : matchdayDate ? 'rgb(245 158 11 / 0.3)' : 'var(--color-border)',
            color: dateValue ? 'var(--color-text)' : 'var(--color-text-muted)',
          }}
        />
        {!dateValue && matchdayDate && (
          <span className="absolute inset-0 flex items-center px-2 text-xs text-amber-400/70 pointer-events-none">
            {new Date(matchdayDate + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      <input
        type="time"
        value={row.time}
        onChange={(e) => onChange(row._id, 'time', e.target.value)}
        className="w-full rounded-lg border px-2 py-2 text-xs outline-none"
        style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: row.time ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      />

      <button type="button" onClick={() => onRemove(row._id)}
        className="flex items-center justify-center w-7 h-7 rounded-lg opacity-40 hover:opacity-80 hover:bg-red-500/10 hover:text-red-400 transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// --- Main ---
export default function AdminLeagueMatches() {
  const { activeTeam } = useTeamStore()
  const teamId = activeTeam?.id

  const [league, setLeague] = useState(null)
  const [leagueTeams, setLeagueTeams] = useState([])
  const [ownTeamId, setOwnTeamId] = useState(null)
  const [existingMatches, setExistingMatches] = useState([])
  const [loading, setLoading] = useState(true)

  const [matchday, setMatchday] = useState(1)
  const [matchdayDate, setMatchdayDate] = useState('') // gedeelde datum voor deze speelronde
  const [rows, setRows] = useState(() => buildRows(1))

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [mirroring, setMirroring] = useState(false)
  const [mirrorDone, setMirrorDone] = useState(false)

  useEffect(() => {
    if (!teamId) return
    async function load() {
      setLoading(true)
      const { data: lg } = await supabase.from('leagues').select('*').eq('team_id', teamId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!lg) { setLoading(false); return }
      setLeague(lg)

      const { data: lt } = await supabase.from('league_teams').select('id, team_name, is_own_team')
        .eq('league_id', lg.id).order('team_name')
      const teams = (lt || []).map((t) => ({ id: t.id, display_name: t.team_name, is_own_team: t.is_own_team }))
      setLeagueTeams(teams)
      const own = teams.find((t) => t.is_own_team)
      if (own) setOwnTeamId(own.id)

      const { data: em } = await supabase.from('league_matches').select('*').eq('league_id', lg.id)
        .order('matchday', { ascending: true })
      setExistingMatches(em || [])
      setLoading(false)
    }
    load()
  }, [teamId])

  // Laad rows + gedeelde datum wanneer speelronde wijzigt
  useEffect(() => {
    const existing = existingMatches.filter((m) => m.matchday === matchday)
    if (existing.length > 0) {
      // Bepaal gedeelde datum: als alle wedstrijden dezelfde datum hebben, gebruik die
      const dates = [...new Set(existing.map((m) => m.match_date).filter(Boolean))]
      setMatchdayDate(dates.length === 1 ? dates[0] : '')
      setRows(existing.map((m) => ({
        _id: m.id, _saved: true, matchday: m.matchday,
        date: m.match_date ? m.match_date.slice(0, 10) : '',
        time: m.match_time ? m.match_time.slice(0, 5) : '',
        home_team_id: m.home_team_id || '', away_team_id: m.away_team_id || '',
      })))
    } else {
      setMatchdayDate('')
      setRows(buildRows(matchday))
    }
    setSaved(false); setSaveError(''); setMirrorDone(false)
  }, [matchday, existingMatches])

  const handleChange = useCallback((id, field, value) => {
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r))
    setSaved(false)
  }, [])

  const handleRemove = useCallback((id) => {
    setRows((prev) => prev.filter((r) => r._id !== id))
  }, [])

  // Datum van speelronde wijzigt → pas toe op rijen zonder eigen datum
  function handleMatchdayDateChange(date) {
    setMatchdayDate(date)
    setSaved(false)
  }

  async function handleSave() {
    if (!league) return
    setSaving(true); setSaveError(''); setSaved(false)

    // Gebruik matchdayDate als fallback voor rijen zonder eigen datum
    const toSave = rows.filter((r) => r.home_team_id && r.away_team_id && (r.date || matchdayDate))
    if (toSave.length === 0) {
      setSaveError('Vul minstens thuis, uit én (speelronde)datum in.')
      setSaving(false); return
    }

    await supabase.from('league_matches').delete().eq('league_id', league.id).eq('matchday', matchday)

    const inserts = toSave.map((r) => ({
      league_id: league.id, matchday,
      match_date: r.date || matchdayDate || null,
      match_time: r.time ? r.time + ':00' : null,
      home_team_id: r.home_team_id, away_team_id: r.away_team_id,
    }))

    const { error: insertErr } = await supabase.from('league_matches').insert(inserts)
    if (insertErr) { setSaveError(insertErr.message); setSaving(false); return }

    const { data: em } = await supabase.from('league_matches').select('*').eq('league_id', league.id)
      .order('matchday', { ascending: true })
    setExistingMatches(em || [])
    setSaving(false); setSaved(true)
  }

  // Genereer 2e helft: kopieer ronden 1..N naar N+1..2N met thuis/uit omgedraaid
  async function handleMirror() {
    if (!league) return
    const filledRounds = [...new Set(existingMatches.map((m) => m.matchday))].sort((a, b) => a - b)
    if (filledRounds.length === 0) return
    const N = filledRounds.length
    setMirroring(true)

    const inserts = []
    filledRounds.forEach((round, idx) => {
      const roundMatches = existingMatches.filter((m) => m.matchday === round)
      const newRound = N + idx + 1
      roundMatches.forEach((m) => {
        inserts.push({
          league_id: league.id,
          matchday: newRound,
          match_date: null,      // datum nog in te vullen
          match_time: null,
          home_team_id: m.away_team_id,  // omgedraaid
          away_team_id: m.home_team_id,
        })
      })
    })

    // Verwijder eerst bestaande 2e helft (als die er al is)
    const secondHalfRounds = filledRounds.map((_, idx) => N + idx + 1)
    await supabase.from('league_matches').delete().eq('league_id', league.id)
      .in('matchday', secondHalfRounds)

    const { error } = await supabase.from('league_matches').insert(inserts)
    if (!error) {
      const { data: em } = await supabase.from('league_matches').select('*').eq('league_id', league.id)
        .order('matchday', { ascending: true })
      setExistingMatches(em || [])
      setMirrorDone(true)
    }
    setMirroring(false)
  }

  const filledMatchdays = [...new Set(existingMatches.map((m) => m.matchday))].sort((a, b) => a - b)
  const N = filledMatchdays.length
  // Toon mirror knop als er speelronden zijn en de 2e helft nog niet volledig gegenereerd is
  const secondHalfExists = filledMatchdays.some((d) => d > N / 2 + 0.5)

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="opacity-50"><ArrowLeft size={20} /></Link>
          <div className="h-7 w-48 rounded-lg bg-slate-700 animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-800 animate-pulse" />)}
      </div>
    )
  }

  if (!league) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="text-slate-400 hover:text-slate-200"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold">Comp. wedstrijden</h1>
        </div>
        <div className="rounded-xl p-8 border text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <Calendar size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium mb-2">Geen competitie aangemaakt</p>
          <Link to="/admin/league" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-4" style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}>
            Naar competitie-instellingen
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin/league" className="text-slate-400 hover:text-slate-200"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">Wedstrijden invoeren</h1>
          <p className="text-xs text-slate-400">{league.name} · {league.season}</p>
        </div>
      </div>

      {/* Speelronde selector + gedeelde datum */}
      <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>

        {/* Ronde nav */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Speelronde</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setMatchday((d) => Math.max(1, d - 1))} disabled={matchday <= 1}
              className="w-8 h-8 rounded-lg border text-sm font-bold disabled:opacity-30 hover:bg-slate-700 transition-colors" style={{ borderColor: 'var(--color-border)' }}>‹</button>
            <span className="w-8 text-center font-bold text-lg">{matchday}</span>
            <button onClick={() => setMatchday((d) => d + 1)}
              className="w-8 h-8 rounded-lg border text-sm font-bold hover:bg-slate-700 transition-colors" style={{ borderColor: 'var(--color-border)' }}>›</button>
          </div>
        </div>

        {/* Datum voor hele speelronde */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Datum speelronde {matchday}
            <span className="ml-1 opacity-60">(geldt voor alle wedstrijden, tenzij individueel overschreven)</span>
          </label>
          <input
            type="date"
            value={matchdayDate}
            onChange={(e) => handleMatchdayDateChange(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            style={{ backgroundColor: 'var(--color-surface-2)', borderColor: matchdayDate ? 'rgb(245 158 11 / 0.5)' : 'var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        {/* Snelkoppelingen */}
        {filledMatchdays.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {filledMatchdays.map((d) => (
              <button key={d} onClick={() => setMatchday(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${d === matchday ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                R{d}
              </button>
            ))}
            {!filledMatchdays.includes(matchday) && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-500 border border-dashed border-slate-600">R{matchday} (nieuw)</span>
            )}
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="grid gap-2 px-1 text-xs font-medium" style={{ gridTemplateColumns: '1fr 1fr 90px 72px 28px', color: 'var(--color-text-muted)' }}>
        <span>Thuis</span><span>Uit</span><span>Datum</span><span>Tijd</span><span />
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <MatchRow key={row._id} row={row} teams={leagueTeams} ownTeamId={ownTeamId}
            matchdayDate={matchdayDate} onChange={handleChange} onRemove={handleRemove} />
        ))}
      </div>

      <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow(matchday)])}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm opacity-50 hover:opacity-80 transition-opacity"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
        <Plus size={16} />Wedstrijd toevoegen
      </button>

      {saveError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />{saveError}
        </div>
      )}

      {saved ? (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          <Check size={16} className="flex-shrink-0" />
          Speelronde {matchday} opgeslagen
          <button className="ml-auto text-xs underline opacity-70 hover:opacity-100"
            onClick={() => { setMatchday((d) => d + 1); setSaved(false) }}>Volgende →</button>
        </div>
      ) : (
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}>
          <Save size={16} />{saving ? 'Opslaan...' : `Speelronde ${matchday} opslaan`}
        </button>
      )}

      {/* Genereer 2e helft */}
      {N > 0 && (
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div>
            <p className="text-sm font-semibold">2e helft genereren</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Kopieert speelronden 1–{N} met thuis/uit omgedraaid naar ronden {N + 1}–{N * 2}.
              Datums vul je daarna per speelronde in.
            </p>
          </div>

          {mirrorDone ? (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Check size={15} />Speelronden {N + 1}–{N * 2} aangemaakt
            </div>
          ) : (
            <button onClick={handleMirror} disabled={mirroring}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <Copy size={15} />
              {mirroring ? 'Bezig...' : `Genereer speelronden ${N + 1}–${N * 2}`}
            </button>
          )}
        </div>
      )}

      {existingMatches.length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-xs text-slate-400">
            {existingMatches.length} wedstrijden · {filledMatchdays.length} speelronden
            {filledMatchdays.length > 0 && ` (R1–R${filledMatchdays[filledMatchdays.length - 1]})`}
          </p>
        </div>
      )}
    </div>
  )
}
