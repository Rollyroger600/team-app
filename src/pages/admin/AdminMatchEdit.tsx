import React from 'react'
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import PageLoader from '../../components/ui/PageLoader'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'

/** Leeg veld -> NULL ("nog geen uitslag"), niet 0. */
function parseScore(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 0 ? n : null
}

interface MatchForm {
  opponent: string
  match_date: string
  match_time: string
  is_home: boolean
  location: string
  status: string
  // Als tekst in het formulier, niet als number: een leeg veld moet "nog geen
  // uitslag" (NULL) kunnen betekenen, en dat is met een number-input niet te
  // onderscheiden van 0.
  score_home: string
  score_away: string
}

export default function AdminMatchEdit(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeTeam } = useTeamStore()
  const isNew = !id

  const [form, setForm] = useState<MatchForm>({
    opponent: '',
    match_date: '',
    match_time: '',
    is_home: true,
    location: '',
    status: 'upcoming',
    score_home: '',
    score_away: '',
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isNew && id) {
      supabase.from('matches').select('*').eq('id', id).single().then(({ data }) => {
        if (data) setForm({
          opponent: data.opponent || '',
          match_date: data.match_date || '',
          match_time: data.match_time?.substring(0, 5) || '',
          is_home: data.is_home ?? true,
          location: data.location || '',
          status: data.status || 'upcoming',
          score_home: data.score_home?.toString() ?? '',
          score_away: data.score_away?.toString() ?? '',
        })
        setLoading(false)
      })
    }
  }, [id, isNew])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!activeTeam?.id) return
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      team_id: activeTeam.id,
      match_time: form.match_time || null,
      score_home: parseScore(form.score_home),
      score_away: parseScore(form.score_away),
    }

    let result
    if (isNew) {
      result = await supabase.from('matches').insert(payload).select().single()
    } else {
      result = await supabase.from('matches').update(payload).eq('id', id!).select().single()
    }

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/matches')
  }

  function handleChange(key: keyof MatchForm, value: string | boolean): void {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleDelete(): Promise<void> {
    if (!id) return
    // Cascade wist ook doelpunten, beschikbaarheid, kaarten en de opstelling voor
    // deze wedstrijd; fluitbeurten en aankondigingen die eraan gekoppeld zijn
    // verliezen alleen de koppeling (match_id → NULL), die blijven zelf bestaan.
    if (!window.confirm(
      `Wedstrijd tegen ${form.opponent || 'onbekende tegenstander'} verwijderen? ` +
      'Doelpunten, beschikbaarheid en opstelling voor deze wedstrijd gaan mee verloren. Dit kan niet ongedaan worden gemaakt.'
    )) return

    setDeleting(true)
    setError('')
    const { error: delErr } = await supabase.from('matches').delete().eq('id', id)
    setDeleting(false)

    if (delErr) {
      setError(delErr.message)
      return
    }
    navigate('/matches')
  }

  if (loading) {
    return <PageLoader />
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft"
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }
  const labelClass = "block text-sm font-medium mb-1.5 text-text-muted"

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{isNew ? 'Wedstrijd toevoegen' : 'Wedstrijd bewerken'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
          <div>
            <label className={labelClass}>Tegenstander *</label>
            <input
              type="text"
              value={form.opponent}
              onChange={(e) => handleChange('opponent', e.target.value)}
              placeholder="Naam tegenstander"
              className={inputClass}
              style={inputStyle}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Datum *</label>
              <input
                type="date"
                value={form.match_date}
                onChange={(e) => handleChange('match_date', e.target.value)}
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Tijd</label>
              <input
                type="time"
                value={form.match_time}
                onChange={(e) => handleChange('match_time', e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Locatie (voor uitwedstrijden)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="Adres van het veld"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Thuis/Uit</label>
              <div className="flex gap-2">
                {[
                  { value: true, label: 'Thuis' },
                  { value: false, label: 'Uit' },
                ].map(({ value, label }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => handleChange('is_home', value)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                      form.is_home === value
                        ? 'border-secondary-soft text-secondary-soft bg-secondary-soft/10'
                        : 'border-border text-text-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="upcoming">Aankomend</option>
                <option value="completed">Gespeeld</option>
                <option value="cancelled">Afgelast</option>
              </select>
            </div>
          </div>

          {form.status === 'completed' && (
            <div>
              <label className={labelClass}>Uitslag</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.score_home}
                  onChange={(e) => handleChange('score_home', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={form.is_home ? 'ons' : 'zij'}
                  aria-label={form.is_home ? 'Doelpunten eigen team' : 'Doelpunten tegenstander'}
                  className={`${inputClass} text-center`}
                  style={inputStyle}
                />
                <span className="text-text-muted font-semibold">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.score_away}
                  onChange={(e) => handleChange('score_away', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={form.is_home ? 'zij' : 'ons'}
                  aria-label={form.is_home ? 'Doelpunten tegenstander' : 'Doelpunten eigen team'}
                  className={`${inputClass} text-center`}
                  style={inputStyle}
                />
              </div>
              <p className="text-xs text-text-subtle mt-1.5">
                Links het thuisspelende team, dus {form.is_home ? 'wij' : 'de tegenstander'}. Leeg
                laten als de uitslag nog niet bekend is.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-danger text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || deleting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
        >
          <Save size={16} />
          {saving ? 'Opslaan...' : isNew ? 'Wedstrijd aanmaken' : 'Wijzigingen opslaan'}
        </button>

        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 text-danger transition-colors hover:bg-unavailable/10"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <Trash2 size={16} />
            {deleting ? 'Verwijderen...' : 'Wedstrijd verwijderen'}
          </button>
        )}
      </form>
    </div>
  )
}
