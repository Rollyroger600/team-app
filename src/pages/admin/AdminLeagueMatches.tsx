import React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Trash2, ChevronDown, Check, AlertCircle, Calendar, Copy, CalendarPlus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { leagueTeamDisplayName } from '../../lib/utils'
import type { League, LeagueMatch } from '../../types/app'

interface LeagueTeamDisplay {
  id: string
  display_name: string
  is_own_team: boolean
  /** Rauwe registratienaam — dit is wat in `matches.opponent` moet landen, niet de korte naam. */
  team_name: string
  registry_id: string | null
}

interface MatchRow {
  _id: string
  _saved?: boolean
  matchday: number
  date: string
  time: string
  home_team_id: string
  away_team_id: string
}

interface LeagueMatchesQueryData {
  league: League | null
  leagueTeams: LeagueTeamDisplay[]
  ownTeamId: string | null
  existingMatches: LeagueMatch[]
}

/** Regel in het uitvoerlog van "Genereer mijn wedstrijden"; `ok: null` = neutrale melding. */
interface LogLine {
  text: string
  ok: boolean | null
}

// Gedeelde fallback voor `existingMatches` uit de query. Moet één stabiel array-object
// zijn, geen verse `[]` per render: het voedt de dependency-array van het effect
// hieronder, dat zelf setRows() met een nieuw array aanroept. Een literal daar gaf elke
// render een nieuwe identiteit, dus het effect draaide steeds opnieuw, zette de rows
// opnieuw, rerenderde... — honderden renders en een stroom "Maximum update depth
// exceeded" bij elk bezoek aan dit scherm zodra er speelronden staan (fixed 2026-08-13).
const NO_MATCHES: LeagueMatch[] = []

interface SaveMutationVars {
  leagueId: string
  matchdayNum: number
  toSave: MatchRow[]
  matchdayDateVal: string
}

function emptyRow(matchday: number): MatchRow {
  return { _id: crypto.randomUUID(), matchday, date: '', time: '', home_team_id: '', away_team_id: '' }
}

function buildRows(matchday: number, count = 6): MatchRow[] {
  return Array.from({ length: count }, () => emptyRow(matchday))
}

// --- Team select ---
interface TeamSelectProps {
  value: string
  onChange: (v: string) => void
  teams: LeagueTeamDisplay[]
  placeholder: string
  ownTeamId: string | null
}

function TeamSelect({ value, onChange, teams, placeholder, ownTeamId }: TeamSelectProps): React.JSX.Element {
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
interface MatchRowComponentProps {
  row: MatchRow
  teams: LeagueTeamDisplay[]
  ownTeamId: string | null
  matchdayDate: string
  onChange: (id: string, field: keyof MatchRow, value: string) => void
  onRemove: (id: string) => void
}

function MatchRowComponent({ row, teams, ownTeamId, matchdayDate, onChange, onRemove }: MatchRowComponentProps): React.JSX.Element {
  const isOwn = row.home_team_id === ownTeamId || row.away_team_id === ownTeamId
  const dateValue = row.date

  return (
    <div
      className={`grid gap-2 items-center rounded-xl p-3 border ${isOwn ? 'border-secondary/40 bg-secondary/5' : ''}`}
      style={{ gridTemplateColumns: '1fr 1fr 90px 72px 28px', ...(!isOwn ? { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' } : {}) }}
    >
      <TeamSelect value={row.home_team_id} onChange={(v) => onChange(row._id, 'home_team_id', v)} teams={teams} placeholder="Thuis" ownTeamId={ownTeamId} />
      <TeamSelect value={row.away_team_id} onChange={(v) => onChange(row._id, 'away_team_id', v)} teams={teams} placeholder="Uit" ownTeamId={ownTeamId} />

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
          <span className="absolute inset-0 flex items-center px-2 text-xs text-secondary-soft/70 pointer-events-none">
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
        className="flex items-center justify-center w-7 h-7 rounded-lg opacity-40 hover:opacity-80 hover:bg-unavailable/10 hover:text-danger transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// --- Main ---
export default function AdminLeagueMatches(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const teamId = activeTeam?.id
  const queryClient = useQueryClient()

  const [matchday, setMatchday] = useState(1)
  const [matchdayDate, setMatchdayDate] = useState('')
  const [rows, setRows] = useState<MatchRow[]>(() => buildRows(1))

  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [mirroring, setMirroring] = useState(false)
  const [mirrorDone, setMirrorDone] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genLog, setGenLog] = useState<LogLine[]>([])

  const { data, isLoading } = useQuery<LeagueMatchesQueryData>({
    queryKey: ['adminLeagueMatches', teamId],
    queryFn: async (): Promise<LeagueMatchesQueryData> => {
      const { data: lg } = await supabase.from('leagues').select('*').eq('team_id', teamId!)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!lg) return { league: null, leagueTeams: [], ownTeamId: null, existingMatches: [] }

      const { data: lt } = await supabase.from('league_teams').select('id, team_name, short_name, is_own_team, registry_id')
        .eq('league_id', lg.id).order('team_name')
      const teams: LeagueTeamDisplay[] = ((lt || []) as { id: string; team_name: string; short_name: string | null; is_own_team: boolean; registry_id: string | null }[]).map((t) => ({ id: t.id, display_name: leagueTeamDisplayName(t), is_own_team: t.is_own_team, team_name: t.team_name, registry_id: t.registry_id }))
      const own = teams.find((t) => t.is_own_team)

      const { data: em } = await supabase.from('league_matches').select('*').eq('league_id', lg.id)
        .order('matchday', { ascending: true })

      return {
        league: lg as League,
        leagueTeams: teams,
        ownTeamId: own?.id || null,
        existingMatches: (em as LeagueMatch[]) || [],
      }
    },
    enabled: !!teamId,
  })

  const league = data?.league || null
  const leagueTeams = data?.leagueTeams || []
  const ownTeamId = data?.ownTeamId || null
  const existingMatches = data?.existingMatches ?? NO_MATCHES

  // Laad rows + gedeelde datum wanneer speelronde wijzigt
  useEffect(() => {
    const existing = existingMatches.filter((m) => m.matchday === matchday)
    if (existing.length > 0) {
      const dates = [...new Set(existing.map((m) => m.match_date).filter(Boolean))] as string[]
      setMatchdayDate(dates.length === 1 ? dates[0] : '')
      setRows(existing.map((m) => ({
        _id: m.id, _saved: true, matchday: m.matchday ?? matchday,
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

  const handleChange = useCallback((id: string, field: keyof MatchRow, value: string) => {
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r))
    setSaved(false)
  }, [])

  const handleRemove = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r._id !== id))
  }, [])

  function handleMatchdayDateChange(date: string): void {
    setMatchdayDate(date)
    setSaved(false)
  }

  // Elke rij krijgt bij het laden van een al-opgeslagen speelronde zijn eigen datum
  // (zie het effect hierboven) — dus zodra een ronde eenmaal is opgeslagen wint die
  // eigen rijdatum altijd van dit gedeelde veld (r.date || matchdayDateVal in
  // handleSave). Het bovenste datumveld wijzigen deed daardoor stilletjes niets meer
  // voor een bestaande ronde. Dit is de expliciete, opt-in manier om alle rijen
  // alsnog gelijk te zetten — bewust geen automatische override bij het typen, dat
  // zou de "tenzij individueel overschreven"-functie (een enkele wedstrijd op een
  // afwijkende datum) stuk maken.
  function applyMatchdayDateToAllRows(): void {
    if (!matchdayDate) return
    setRows((prev) => prev.map((r) => ({ ...r, date: matchdayDate })))
    setSaved(false)
  }

  const saveMutation = useMutation<void, Error, SaveMutationVars>({
    mutationFn: async ({ leagueId, matchdayNum, toSave, matchdayDateVal }: SaveMutationVars): Promise<void> => {
      await supabase.from('league_matches').delete().eq('league_id', leagueId).eq('matchday', matchdayNum)
      const inserts = toSave.map((r) => ({
        league_id: leagueId, matchday: matchdayNum,
        match_date: r.date || matchdayDateVal || null,
        match_time: r.time ? r.time + ':00' : null,
        home_team_id: r.home_team_id, away_team_id: r.away_team_id,
      }))
      const { error: insertErr } = await supabase.from('league_matches').insert(inserts)
      if (insertErr) throw insertErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminLeagueMatches', teamId] })
      setSaved(true)
    },
    onError: (err) => {
      setSaveError(err.message)
    },
  })

  async function handleSave(): Promise<void> {
    if (!league) return
    setSaveError(''); setSaved(false)

    const toSave = rows.filter((r) => r.home_team_id && r.away_team_id && (r.date || matchdayDate))
    if (toSave.length === 0) {
      setSaveError('Vul minstens thuis, uit én (speelronde)datum in.')
      return
    }

    await saveMutation.mutateAsync({ leagueId: league.id, matchdayNum: matchday, toSave, matchdayDateVal: matchdayDate })
  }

  async function handleMirror(): Promise<void> {
    if (!league || halfLen < 1) return

    // Bron is altijd ronde 1..halfLen — nooit "alles wat er staat", anders telt een
    // tweede klik de al gegenereerde 2e helft mee als eerste helft.
    const sourceRounds = filledMatchdays.filter((d) => d >= 1 && d <= halfLen)
    if (sourceRounds.length === 0) return

    if (secondHalfExists && !window.confirm(
      `Speelronden ${halfLen + 1}–${halfLen * 2} bestaan al en worden opnieuw aangemaakt. ` +
      'Datums en tijden die je daar hebt ingevuld gaan verloren. Doorgaan?'
    )) return

    setMirroring(true)
    setSaveError('')

    const inserts: { league_id: string; matchday: number; match_date: null; match_time: null; home_team_id: string | null; away_team_id: string | null }[] = []
    for (const round of sourceRounds) {
      for (const m of existingMatches.filter((x) => x.matchday === round)) {
        inserts.push({
          league_id: league.id,
          matchday: round + halfLen, // vaste offset: R spiegelt altijd naar R + halfLen
          match_date: null,
          match_time: null,
          home_team_id: m.away_team_id,
          away_team_id: m.home_team_id,
        })
      }
    }

    // Alles boven de eerste helft weg — ook eventuele rommel van een eerdere dubbelklik.
    const { error: delErr } = await supabase.from('league_matches').delete()
      .eq('league_id', league.id).gt('matchday', halfLen)
    if (delErr) {
      setSaveError(delErr.message)
      setMirroring(false)
      return
    }

    const { error } = await supabase.from('league_matches').insert(inserts)
    if (error) {
      setSaveError(error.message)
    } else {
      queryClient.invalidateQueries({ queryKey: ['adminLeagueMatches', teamId] })
      setMirrorDone(true)
    }
    setMirroring(false)
  }

  /**
   * Maakt `matches`-rijen voor elke poulewedstrijd waarin het eigen team speelt.
   *
   * Herhaalbaar op twee manieren, allebei nodig:
   *  - poulewedstrijden zonder datum worden overgeslagen (`matches.match_date` is NOT NULL),
   *    dus de 2e helft komt er pas bij zodra die datums zijn ingevuld;
   *  - een bestaande wedstrijd wordt herkend via `league_match_id` óf via datum + tegenstander.
   *    Die tweede route herstelt de koppeling die verloren gaat als de 2e helft opnieuw is
   *    gegenereerd (`matches.league_match_id` is ON DELETE SET NULL), in plaats van een duplicaat
   *    aan te maken.
   */
  async function handleGenerateOwnMatches(): Promise<void> {
    if (!league || !ownTeamId || !teamId) return
    setGenerating(true)
    setGenLog([])

    const byId = new Map(leagueTeams.map((t) => [t.id, t]))
    const ownFixtures = existingMatches.filter(
      (m) => m.home_team_id === ownTeamId || m.away_team_id === ownTeamId,
    )
    const datedFixtures = ownFixtures.filter((m) => m.match_date)
    const skipped = ownFixtures.length - datedFixtures.length

    const { data: existingOwn, error: fetchErr } = await supabase
      .from('matches')
      .select('id, league_match_id, match_date, opponent')
      .eq('team_id', teamId)

    if (fetchErr) {
      setGenLog([{ text: `Ophalen bestaande wedstrijden mislukt: ${fetchErr.message}`, ok: false }])
      setGenerating(false)
      return
    }

    const byLinkId = new Map<string, string>()
    const byDateOpponent = new Map<string, string>()
    for (const m of existingOwn || []) {
      if (m.league_match_id) byLinkId.set(m.league_match_id, m.id)
      if (m.match_date && m.opponent) byDateOpponent.set(`${m.match_date}|${m.opponent}`, m.id)
    }

    let added = 0
    let updated = 0
    let relinked = 0
    const failures: string[] = []

    for (const lm of datedFixtures) {
      const isHome = lm.home_team_id === ownTeamId
      const opponentTeam = byId.get((isHome ? lm.away_team_id : lm.home_team_id) || '')
      if (!opponentTeam) {
        failures.push('Poulewedstrijd zonder tegenstander overgeslagen')
        continue
      }

      const matchDate = lm.match_date!.slice(0, 10)
      // Bewust de volledige registratienaam: useOpponentName() mapt `matches.opponent`
      // op `league_teams.team_name` om de korte naam te vinden.
      const opponent = opponentTeam.team_name
      const payload = {
        match_date: matchDate,
        match_time: lm.match_time,
        is_home: isHome,
        opponent,
        registry_id: opponentTeam.registry_id,
        league_match_id: lm.id,
      }

      const linkedId = byLinkId.get(lm.id)
      const looseId = linkedId ? undefined : byDateOpponent.get(`${matchDate}|${opponent}`)
      const targetId = linkedId || looseId

      const { error } = targetId
        ? await supabase.from('matches').update(payload).eq('id', targetId)
        : await supabase.from('matches').insert({ ...payload, team_id: teamId, status: 'upcoming' })

      if (error) {
        // 23505 = de partiële unique index op matches(league_match_id). Betekent dat een
        // parallelle run (dubbelklik) deze wedstrijd net heeft aangemaakt — geen echte fout.
        if (error.code !== '23505') {
          failures.push(`${opponentTeam.display_name}: ${error.message}`)
        }
      } else if (linkedId) {
        updated++
      } else if (looseId) {
        relinked++
      } else {
        added++
      }
    }

    const lines: LogLine[] = []
    if (added) lines.push({ text: `${added} wedstrijd${added === 1 ? '' : 'en'} toegevoegd`, ok: true })
    if (updated) lines.push({ text: `${updated} bijgewerkt`, ok: true })
    if (relinked) lines.push({ text: `${relinked} opnieuw gekoppeld aan de poule`, ok: true })
    if (skipped) lines.push({ text: `${skipped} overgeslagen (nog geen datum in de poule)`, ok: null })
    for (const f of failures) lines.push({ text: f, ok: false })
    if (lines.length === 0) lines.push({ text: 'Niets te doen — alles staat al goed.', ok: null })

    setGenLog(lines)
    queryClient.invalidateQueries({ queryKey: ['matches', teamId] })
    queryClient.invalidateQueries({ queryKey: ['nextMatch', teamId] })
    setGenerating(false)
  }

  const filledMatchdays = [...new Set(existingMatches.map((m) => m.matchday))].filter((d): d is number => d !== null).sort((a, b) => a - b)
  const N = filledMatchdays.length
  // Aantal ronden per helft volgt uit de poulegrootte, niet uit wat er toevallig al staat.
  // Even aantal teams → T-1 ronden; oneven → T ronden (elke ronde één team vrij).
  const halfLen = leagueTeams.length === 0 ? 0 : leagueTeams.length % 2 === 0 ? leagueTeams.length - 1 : leagueTeams.length
  const secondHalfExists = filledMatchdays.some((d) => d > halfLen)
  const saving = saveMutation.isPending

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="opacity-50"><ArrowLeft size={20} /></Link>
          <div className="h-7 w-48 rounded-lg bg-surface-3 animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-surface animate-pulse" />)}
      </div>
    )
  }

  if (!league) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin/league" className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold">Comp. wedstrijden</h1>
        </div>
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <Calendar size={40} className="mx-auto mb-3 text-text-faint" />
          <p className="font-medium mb-2">Geen competitie aangemaakt</p>
          <Link to="/admin/league" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-4 bg-secondary text-secondary-text">
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
        <Link to="/admin/league" className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">Wedstrijden invoeren</h1>
          <p className="text-xs text-text-muted">{league.name} · {league.season}</p>
        </div>
      </div>

      {/* Speelronde selector + gedeelde datum */}
      <div className="rounded-xl border p-4 space-y-4 bg-surface border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-muted">Speelronde</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setMatchday((d) => Math.max(1, d - 1))} disabled={matchday <= 1}
              className="w-8 h-8 rounded-lg border text-sm font-bold disabled:opacity-30 hover:bg-surface-3 transition-colors border-border">‹</button>
            <span className="w-8 text-center font-bold text-lg">{matchday}</span>
            <button onClick={() => setMatchday((d) => d + 1)}
              className="w-8 h-8 rounded-lg border text-sm font-bold hover:bg-surface-3 transition-colors border-border">›</button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-text-muted">
            Datum speelronde {matchday}
            <span className="ml-1 opacity-60">(geldt voor alle wedstrijden, tenzij individueel overschreven)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={matchdayDate}
              onChange={(e) => handleMatchdayDateChange(e.target.value)}
              className="flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-secondary-soft"
              style={{ backgroundColor: 'var(--color-surface-2)', borderColor: matchdayDate ? 'rgb(245 158 11 / 0.5)' : 'var(--color-border)', color: 'var(--color-text)' }}
            />
            {rows.length > 0 && (
              <button type="button" onClick={applyMatchdayDateToAllRows} disabled={!matchdayDate}
                title="Zet de datum van alle wedstrijden in deze speelronde gelijk aan de datum hierboven"
                className="flex-shrink-0 px-3 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity bg-surface-2 text-text"
                style={{ border: '1px solid var(--color-border)' }}>
                Toepassen op alle
              </button>
            )}
          </div>
        </div>

        {filledMatchdays.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {filledMatchdays.map((d) => (
              <button key={d} onClick={() => setMatchday(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${d === matchday ? 'bg-secondary text-bg' : 'bg-surface-3 text-text-soft hover:bg-surface-4'}`}>
                R{d}
              </button>
            ))}
            {!filledMatchdays.includes(matchday) && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-surface text-text-subtle border border-dashed border-border-strong">R{matchday} (nieuw)</span>
            )}
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="grid gap-2 px-1 text-xs font-medium text-text-muted" style={{ gridTemplateColumns: '1fr 1fr 90px 72px 28px' }}>
        <span>Thuis</span><span>Uit</span><span>Datum</span><span>Tijd</span><span />
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <MatchRowComponent key={row._id} row={row} teams={leagueTeams} ownTeamId={ownTeamId}
            matchdayDate={matchdayDate} onChange={handleChange} onRemove={handleRemove} />
        ))}
      </div>

      <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow(matchday)])}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm opacity-50 hover:opacity-80 transition-opacity border-border text-text-muted">
        <Plus size={16} />Wedstrijd toevoegen
      </button>

      {saveError && (
        <div className="flex items-center gap-2 text-sm text-danger bg-unavailable/10 border border-unavailable/20 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />{saveError}
        </div>
      )}

      {saved ? (
        <div className="flex items-center gap-2 text-sm text-success bg-available/10 border border-available/20 rounded-xl px-4 py-3">
          <Check size={16} className="flex-shrink-0" />
          Speelronde {matchday} opgeslagen
          <button className="ml-auto text-xs underline opacity-70 hover:opacity-100"
            onClick={() => { setMatchday((d) => d + 1); setSaved(false) }}>Volgende →</button>
        </div>
      ) : (
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text">
          <Save size={16} />{saving ? 'Opslaan...' : `Speelronde ${matchday} opslaan`}
        </button>
      )}

      {/* Genereer 2e helft */}
      {N > 0 && halfLen > 0 && (
        <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <div>
            <p className="text-sm font-semibold">2e helft genereren</p>
            <p className="text-xs text-text-muted mt-0.5">
              Kopieert speelronden 1–{halfLen} met thuis/uit omgedraaid naar ronden {halfLen + 1}–{halfLen * 2}.
              Datums vul je daarna per speelronde in.
            </p>
          </div>

          {secondHalfExists && (
            <p className="text-xs text-secondary-soft">
              Ronden {halfLen + 1}–{halfLen * 2} bestaan al. Opnieuw genereren overschrijft ze —
              inclusief de datums die je daar hebt ingevuld.
            </p>
          )}

          {mirrorDone ? (
            <div className="flex items-center gap-2 text-sm text-success">
              <Check size={15} />Speelronden {halfLen + 1}–{halfLen * 2} aangemaakt
            </div>
          ) : (
            <button onClick={handleMirror} disabled={mirroring}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity bg-surface-2 text-text"
              style={{ border: '1px solid var(--color-border)' }}>
              <Copy size={15} />
              {mirroring ? 'Bezig...' : `Genereer speelronden ${halfLen + 1}–${halfLen * 2}`}
            </button>
          )}
        </div>
      )}

      {/* Genereer eigen wedstrijden uit de poule */}
      {ownTeamId && N > 0 && (
        <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <div>
            <p className="text-sm font-semibold">Mijn wedstrijden genereren</p>
            <p className="text-xs text-text-muted mt-0.5">
              Zet elke poulewedstrijd met een datum waarin jouw team speelt om in een wedstrijd
              op Wedstrijden — inclusief de koppeling die reistijden en verzameltijden nodig hebben.
              Je kunt dit herhalen zodra je de datums van de 2e helft hebt ingevuld.
            </p>
          </div>

          {genLog.length > 0 && (
            <ul className="text-xs space-y-1">
              {genLog.map((line, i) => (
                <li key={i} className={line.ok === false ? 'text-danger' : line.ok ? 'text-success' : 'text-text-muted'}>
                  {line.text}
                </li>
              ))}
            </ul>
          )}

          <button onClick={handleGenerateOwnMatches} disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity bg-surface-2 text-text"
            style={{ border: '1px solid var(--color-border)' }}>
            <CalendarPlus size={15} />
            {generating ? 'Bezig...' : 'Genereer mijn wedstrijden'}
          </button>
        </div>
      )}

      {existingMatches.length > 0 && (
        <div className="rounded-xl border p-4 bg-surface border-border">
          <p className="text-xs text-text-muted">
            {existingMatches.length} wedstrijden · {filledMatchdays.length} speelronden
            {filledMatchdays.length > 0 && ` (R1–R${filledMatchdays[filledMatchdays.length - 1]})`}
          </p>
        </div>
      )}
    </div>
  )
}
