import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Plus, Trash2, Ban, RotateCcw, AlertCircle, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import {
  useTrainings,
  generateTrainings,
  generateDates,
  formatTrainingDate,
  formatTime,
  toISODate,
  WEEKDAYS,
  type Training,
} from '../../lib/trainings'
import { tint } from '../../lib/utils'

/**
 * Admin → Trainingen. Genereren volgens een cadans, plus losse trainingen
 * toevoegen, afgelasten en verwijderen.
 *
 * Het generatordialoog is niet-opgeslagen formulierstaat: de cadans wordt nergens
 * bewaard, alleen de gegenereerde rijen. Voorvulling komt uit teams.training_*,
 * die een Hoofdbeheerder in Team-instellingen zet.
 */
export default function AdminTrainings(): React.JSX.Element {
  const { activeTeam, teamSettings } = useTeamStore()
  const queryClient = useQueryClient()
  const { data: trainings = [], isLoading } = useTrainings(activeTeam?.id)

  const vandaag = toISODate(new Date())
  const overDrieMaanden = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return toISODate(d)
  })()

  const [showGen, setShowGen] = useState(false)
  const [from, setFrom] = useState(vandaag)
  const [to, setTo] = useState(overDrieMaanden)
  const [weekday, setWeekday] = useState(teamSettings.training_default_weekday ?? 2)
  const [interval, setInterval] = useState(teamSettings.training_interval_weeks)
  const [startTime, setStartTime] = useState((teamSettings.training_default_time ?? '20:00').slice(0, 5))
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [addDate, setAddDate] = useState(vandaag)
  const [addTime, setAddTime] = useState('20:00')
  const [addLocation, setAddLocation] = useState('')

  const voorbeeld = generateDates(from, to, weekday, interval)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['trainings', activeTeam?.id] })
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeTeam?.id) return
    setBusy(true); setResult(null)
    const r = await generateTrainings(activeTeam.id, {
      from, to, weekday, intervalWeeks: interval,
      startTime, endTime: endTime || null, location: location.trim() || null,
    })
    setBusy(false)
    if (r.error) { setResult({ ok: false, message: r.error }); return }
    refresh()
    setResult({
      ok: true,
      message: r.bestond > 0
        ? `${r.aangemaakt} nieuwe training${r.aangemaakt === 1 ? '' : 'en'}, ${r.bestond} bestond${r.bestond === 1 ? '' : 'en'} al.`
        : `${r.aangemaakt} training${r.aangemaakt === 1 ? '' : 'en'} aangemaakt.`,
    })
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeTeam?.id) return
    setBusy(true); setResult(null)
    // generated blijft false: de opruimstap van de generator mag hier nooit aankomen.
    const { error } = await supabase.from('trainings').insert({
      team_id: activeTeam.id,
      training_date: addDate,
      start_time: addTime,
      location: addLocation.trim() || null,
    })
    setBusy(false)
    if (error) {
      setResult({ ok: false, message: error.code === '23505'
        ? 'Er staat al een training op die datum en tijd.'
        : error.message })
      return
    }
    setShowAdd(false); setAddLocation('')
    refresh()
    setResult({ ok: true, message: 'Training toegevoegd.' })
  }

  async function toggleCancel(t: Training) {
    const next = t.status === 'cancelled' ? 'scheduled' : 'cancelled'
    if (next === 'cancelled' && !window.confirm(`Training van ${formatTrainingDate(t.training_date)} afgelasten? De antwoorden blijven bewaard.`)) return
    const { error } = await supabase.from('trainings').update({ status: next }).eq('id', t.id)
    if (!error) refresh()
  }

  async function remove(t: Training) {
    if (!window.confirm(`Training van ${formatTrainingDate(t.training_date)} definitief verwijderen? De antwoorden van spelers gaan mee.`)) return
    const { error } = await supabase.from('trainings').delete().eq('id', t.id)
    if (!error) refresh()
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft bg-surface-2 border-border text-text'
  const labelClass = 'block text-xs font-medium mb-1 text-text-muted'

  const komend = trainings.filter(t => t.training_date >= vandaag)
  const geweest = trainings.filter(t => t.training_date < vandaag).reverse()

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold">Trainingen</h1>
        </div>
        <button
          onClick={() => { setShowGen(v => !v); setShowAdd(false); setResult(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text"
        >
          <CalendarPlus size={16} /> Genereren
        </button>
      </div>

      {result && (
        <p className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.ok ? <Check size={14} /> : <AlertCircle size={14} />} {result.message}
        </p>
      )}

      {showGen && (
        <form onSubmit={handleGenerate} className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <h2 className="font-semibold text-sm">Trainingen genereren</h2>
          <p className="text-xs text-text-muted">
            Klik gerust twee keer: bestaande trainingen blijven staan en er komen geen dubbele bij.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Vanaf</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tot en met</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Welke dag</label>
            <select value={weekday} onChange={e => setWeekday(Number(e.target.value))} className={inputClass}>
              {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Hoe vaak</label>
            <select value={interval} onChange={e => setInterval(Number(e.target.value))} className={inputClass}>
              <option value={1}>Elke week</option>
              <option value={2}>Om de week</option>
              <option value={3}>Elke 3 weken</option>
              <option value={4}>Elke 4 weken</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Begintijd</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Eindtijd <span className="text-text-faint">(optioneel)</span></label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Locatie <span className="text-text-faint">(optioneel)</span></label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Veld 2" className={inputClass} />
          </div>

          <p className="text-xs rounded-lg px-2.5 py-2 text-text-muted" style={{ backgroundColor: tint('--color-secondary', 6) }}>
            {voorbeeld.length === 0
              ? 'Geen datums in dit bereik.'
              : `${voorbeeld.length} training${voorbeeld.length === 1 ? '' : 'en'}: ${formatTrainingDate(voorbeeld[0])}${voorbeeld.length > 1 ? ` t/m ${formatTrainingDate(voorbeeld[voorbeeld.length - 1])}` : ''}`}
          </p>

          <button
            type="submit"
            disabled={busy || voorbeeld.length === 0}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 bg-secondary text-secondary-text"
          >
            {busy ? 'Bezig...' : 'Trainingen aanmaken'}
          </button>
        </form>
      )}

      {!showGen && (
        <button
          onClick={() => { setShowAdd(v => !v); setResult(null) }}
          className="flex items-center gap-1.5 text-sm text-secondary-soft"
        >
          <Plus size={15} /> Losse training toevoegen
        </button>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <h2 className="font-semibold text-sm">Losse training</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Datum</label>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Begintijd</label>
              <input type="time" value={addTime} onChange={e => setAddTime(e.target.value)} className={inputClass} required />
            </div>
          </div>
          <div>
            <label className={labelClass}>Locatie <span className="text-text-faint">(optioneel)</span></label>
            <input type="text" value={addLocation} onChange={e => setAddLocation(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 bg-secondary text-secondary-text">
            {busy ? 'Bezig...' : 'Toevoegen'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-text-muted">Laden...</p>}

      {!isLoading && trainings.length === 0 && (
        <EmptyState icon={CalendarPlus}>
          Nog geen trainingen. Genereer ze in één keer voor het hele seizoen, of voeg er losse toe.
        </EmptyState>
      )}

      {komend.length > 0 && <TrainingList titel={`Komend (${komend.length})`} items={komend} onCancel={toggleCancel} onRemove={remove} />}
      {geweest.length > 0 && <TrainingList titel={`Al geweest (${geweest.length})`} items={geweest} onCancel={toggleCancel} onRemove={remove} />}
    </div>
  )
}

interface TrainingListProps {
  titel: string
  items: Training[]
  onCancel: (t: Training) => void
  onRemove: (t: Training) => void
}

function TrainingList({ titel, items, onCancel, onRemove }: TrainingListProps) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-2 mt-4 text-text-muted">{titel}</p>
      <div className="rounded-xl border overflow-hidden bg-surface border-border">
        {items.map(t => {
          const afgelast = t.status === 'cancelled'
          return (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${afgelast ? 'line-through text-text-muted' : ''}`}>
                  {formatTrainingDate(t.training_date)}
                </p>
                <p className="text-xs text-text-subtle truncate">
                  {formatTime(t.start_time)}
                  {t.end_time && `–${formatTime(t.end_time)}`}
                  {t.location && ` · ${t.location}`}
                  {afgelast && ' · afgelast'}
                </p>
              </div>
              <button
                onClick={() => onCancel(t)}
                aria-label={afgelast ? 'Toch laten doorgaan' : 'Afgelasten'}
                title={afgelast ? 'Toch laten doorgaan' : 'Afgelasten'}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-text-muted hover:bg-surface-2"
              >
                {afgelast ? <RotateCcw size={14} /> : <Ban size={14} />}
              </button>
              <button
                onClick={() => onRemove(t)}
                aria-label="Verwijderen"
                title="Verwijderen"
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-danger hover:bg-unavailable/10"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
