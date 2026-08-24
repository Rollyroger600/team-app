import React from 'react'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save, Crown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import { DAY_NAMES_NL } from '../../lib/utils'
import { DEFAULT_POTJESCUP_RULES } from '../../lib/potjescup'
import useTeamStore from '../../stores/useTeamStore'
import { useIsTeamOwner } from '../../lib/permissions'
import type { Team } from '../../types/app'

interface TeamSettingsForm {
  name: string
  gathering_lead_time: number
  travel_buffer_minutes: number
  match_squad_size: number
  gathering_rounding_minutes: number
  potjescup_enabled: boolean
  competitie_enabled: boolean
  trainingen_enabled: boolean
  kitty_enabled: boolean
  kitty_name: string
  kitty_visible_to_players: boolean
  training_default_weekday: number
  training_default_time: string
  training_interval_weeks: number
  potjescup_rules_text: string
  fluitbeurten_enabled: boolean
  fluitbeurten_mode: 'auto' | 'manual'
  fluitbeurten_day_of_week: number
  fluitbeurten_relative_to_match: 'before' | 'after' | 'match_day'
  gathering_banner_enabled: boolean
}

// potjescup_rules_text is in de DB nullable (NULL = val terug op de hardcoded tekst),
// maar in het formulier altijd een string (anders heeft de textarea geen controlled
// value) — alleen bij het opslaan wordt een leeg veld weer naar NULL vertaald.
type SavePayload = Omit<TeamSettingsForm, 'potjescup_rules_text'> & { potjescup_rules_text: string | null }

const checkboxClass = 'w-4 h-4 rounded accent-[var(--color-secondary)]'

export default function AdminTeamSettings(): React.JSX.Element {
  const { activeTeam, refreshTeam } = useTeamStore()
  const canManage = useIsTeamOwner()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<TeamSettingsForm>({
    name: '',
    gathering_lead_time: 30,
    travel_buffer_minutes: 10,
    match_squad_size: 16,
    gathering_rounding_minutes: 15,
    potjescup_enabled: true,
    competitie_enabled: true,
    trainingen_enabled: false,
    kitty_enabled: false,
    kitty_name: 'Bierpot',
    kitty_visible_to_players: false,
    training_default_weekday: 2,
    training_default_time: '20:00',
    training_interval_weeks: 1,
    potjescup_rules_text: '',
    fluitbeurten_enabled: true,
    fluitbeurten_mode: 'auto',
    fluitbeurten_day_of_week: 6,
    fluitbeurten_relative_to_match: 'before',
    gathering_banner_enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const { isLoading } = useQuery<Team | null>({
    queryKey: ['adminTeamSettings', activeTeam?.id],
    queryFn: async (): Promise<Team | null> => {
      // Settings are sourced from the activeTeam store object — no extra fetch needed
      return activeTeam
    },
    enabled: !!activeTeam?.id,
  })

  // Sync form when activeTeam changes (initial load or store update)
  useEffect(() => {
    if (activeTeam) {
      setForm({
        name: activeTeam.name || '',
        gathering_lead_time: activeTeam.gathering_lead_time ?? 30,
        travel_buffer_minutes: activeTeam.travel_buffer_minutes ?? 10,
        match_squad_size: activeTeam.match_squad_size ?? 16,
        gathering_rounding_minutes: activeTeam.gathering_rounding_minutes ?? 15,
        potjescup_enabled: activeTeam.potjescup_enabled ?? true,
        competitie_enabled: activeTeam.competitie_enabled ?? true,
        trainingen_enabled: activeTeam.trainingen_enabled ?? false,
        kitty_enabled: activeTeam.kitty_enabled ?? false,
        kitty_name: activeTeam.kitty_name ?? 'Bierpot',
        kitty_visible_to_players: activeTeam.kitty_visible_to_players ?? false,
        training_default_weekday: activeTeam.training_default_weekday ?? 2,
        training_default_time: (activeTeam.training_default_time ?? '20:00').slice(0, 5),
        training_interval_weeks: activeTeam.training_interval_weeks ?? 1,
        // Nog niets opgeslagen? Start dan vanaf de huidige standaardtekst, zodat er
        // iets zinnigs staat om vanaf te bewerken i.p.v. een leeg vak.
        potjescup_rules_text: activeTeam.potjescup_rules_text || DEFAULT_POTJESCUP_RULES.join('\n\n'),
        fluitbeurten_enabled: activeTeam.fluitbeurten_enabled ?? true,
        fluitbeurten_mode: (activeTeam.fluitbeurten_mode as 'auto' | 'manual') ?? 'auto',
        fluitbeurten_day_of_week: activeTeam.fluitbeurten_day_of_week ?? 6,
        fluitbeurten_relative_to_match: (activeTeam.fluitbeurten_relative_to_match as 'before' | 'after' | 'match_day') ?? 'before',
        gathering_banner_enabled: activeTeam.gathering_banner_enabled ?? true,
      })
    }
  }, [activeTeam?.id])

  const saveMutation = useMutation<void, Error, SavePayload>({
    mutationFn: async (values: SavePayload): Promise<void> => {
      const { error: updateError } = await supabase
        .from('teams')
        .update(values)
        .eq('id', activeTeam!.id)
      if (updateError) throw updateError
      await refreshTeam(activeTeam!.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeamSettings', activeTeam?.id] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!activeTeam?.id) return
    // Bevestiging tegen per-ongeluk aanpassen — zelfde patroon als bij het verwijderen
    // van een fluitbeurt of Potjescup-training, nu voor het opslaan hier omdat dit
    // teambreed gedrag raakt (features aan/uit, verzameltijden).
    if (!window.confirm('Teaminstellingen opslaan? Dit geldt direct voor het hele team.')) return
    setSaving(true)
    setError('')
    setSaved(false)

    await saveMutation.mutateAsync({
      ...form,
      gathering_lead_time: Number(form.gathering_lead_time),
      travel_buffer_minutes: Number(form.travel_buffer_minutes),
      match_squad_size: Number(form.match_squad_size),
      gathering_rounding_minutes: Number(form.gathering_rounding_minutes),
      fluitbeurten_day_of_week: Number(form.fluitbeurten_day_of_week),
      potjescup_rules_text: form.potjescup_rules_text.trim() || null,
    })

    setSaving(false)
  }

  function handleChange(key: keyof TeamSettingsForm, value: string | number | boolean): void {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft"
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }
  const labelClass = "block text-sm font-medium mb-1.5 text-text-muted"

  if (isLoading) {
    return <PageLoader />
  }

  // De hele pagina is hoofdbeheerder/platform-admin-only (niet alleen de nieuwe
  // toggles) — teams.name/gathering_lead_time/travel_buffer_minutes/match_squad_size
  // horen inhoudelijk ook bij "instellingen". De DB-trigger enforce_team_owner_only_settings
  // is de echte handhaving; dit voorkomt alleen dat een gewone Beheerder hier een
  // verwarrende opslagfout tegenkomt.
  if (!canManage) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin" className="text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Team instellingen</h1>
        </div>
        <EmptyState icon={Crown}>
          Alleen de hoofdbeheerder of platform-admin kan teaminstellingen wijzigen.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Team instellingen</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
          <h2 className="font-semibold text-sm text-text-soft uppercase tracking-wide">Algemeen</h2>

          <div>
            <label className={labelClass}>Teamnaam</label>
            <input type="text" value={form.name}
                   onChange={(e) => handleChange('name', e.target.value)}
                   className={inputClass} style={inputStyle} required />
          </div>

        </div>

        <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
          <h2 className="font-semibold text-sm text-text-soft uppercase tracking-wide">Verzameltijden</h2>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.gathering_banner_enabled}
                   onChange={(e) => handleChange('gathering_banner_enabled', e.target.checked)}
                   className={checkboxClass} />
            <span className="text-sm">Verzameltijd-balk tonen op Home</span>
          </label>

          <div>
            <label className={labelClass}>Aanwezig zijn voor aanvang (minuten)</label>
            <input type="number" min="0" max="120" value={form.gathering_lead_time}
                   onChange={(e) => handleChange('gathering_lead_time', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-text-subtle mt-1">Standaard: 30 minuten voor aanvang</p>
          </div>

          <div>
            <label className={labelClass}>Reisbuffer (minuten)</label>
            <input type="number" min="0" max="60" value={form.travel_buffer_minutes}
                   onChange={(e) => handleChange('travel_buffer_minutes', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-text-subtle mt-1">Extra buffer bovenop reistijd voor uitwedstrijden</p>
          </div>

          <div>
            <label className={labelClass}>Afronding verzameltijd</label>
            <select value={form.gathering_rounding_minutes}
                    onChange={(e) => handleChange('gathering_rounding_minutes', Number(e.target.value))}
                    className={inputClass} style={inputStyle}>
              <option value={0}>Geen afronding</option>
              <option value={10}>Naar beneden op 10 minuten</option>
              <option value={15}>Naar beneden op 15 minuten</option>
            </select>
            <p className="text-xs text-text-subtle mt-1">Rondt de berekende verzameltijd naar beneden af — altijd extra buffer, nooit te laat</p>
          </div>

          <div>
            <label className={labelClass}>Selectiegrootte</label>
            <input type="number" min="1" max="30" value={form.match_squad_size}
                   onChange={(e) => handleChange('match_squad_size', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-text-subtle mt-1">Aantal spelers in de wedstrijdselectie</p>
          </div>
        </div>

        <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
          <h2 className="font-semibold text-sm text-text-soft uppercase tracking-wide">Functies</h2>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.competitie_enabled}
                     onChange={(e) => handleChange('competitie_enabled', e.target.checked)}
                     className={checkboxClass} />
              <span className="text-sm">Competitie</span>
            </label>
            <p className="pl-6 text-xs text-text-subtle">
              Uit = geen poulestand en geen &quot;Hele poule&quot;-weergave. De eigen wedstrijden
              blijven gewoon staan, ook oefenwedstrijden.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.kitty_enabled}
                     onChange={(e) => handleChange('kitty_enabled', e.target.checked)}
                     className={checkboxClass} />
              <span className="text-sm">Teamkas</span>
            </label>
            {form.kitty_enabled && (
              <div className="pl-6 space-y-2">
                <div>
                  <label className={labelClass}>Hoe heet de pot</label>
                  <input type="text" value={form.kitty_name}
                         onChange={(e) => handleChange('kitty_name', e.target.value)}
                         placeholder="Bierpot" className={inputClass} style={inputStyle} maxLength={30} />
                </div>
                <p className="text-xs text-text-subtle">
                  De bedragen zet je per inlegronde in Admin &rarr; {form.kitty_name}. Daar kun je
                  ook per speler afwijken, bijvoorbeeld voor iemand die een half seizoen
                  geblesseerd is.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.kitty_visible_to_players}
                         onChange={(e) => handleChange('kitty_visible_to_players', e.target.checked)}
                         className={checkboxClass} />
                  <span className="text-sm">Zichtbaar voor het hele team</span>
                </label>
                <p className="text-xs text-text-subtle">
                  Uit = alleen beheerders zien de kas. Aan = iedereen ziet het kassaldo, wie er
                  nog moet betalen en alle boekingen.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.trainingen_enabled}
                     onChange={(e) => handleChange('trainingen_enabled', e.target.checked)}
                     className={checkboxClass} />
              <span className="text-sm">Trainingen</span>
            </label>
            {form.trainingen_enabled && (
              <div className="pl-6 space-y-2">
                <p className="text-xs text-text-subtle">
                  Dit is alleen de voorvulling van het generatiescherm in Admin &rarr; Trainingen.
                  Het schema zelf zijn de trainingen die je daar aanmaakt.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Standaard dag</label>
                    <select value={form.training_default_weekday}
                            onChange={(e) => handleChange('training_default_weekday', Number(e.target.value))}
                            className={inputClass} style={inputStyle}>
                      <option value={0}>zondag</option>
                      <option value={1}>maandag</option>
                      <option value={2}>dinsdag</option>
                      <option value={3}>woensdag</option>
                      <option value={4}>donderdag</option>
                      <option value={5}>vrijdag</option>
                      <option value={6}>zaterdag</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Standaard tijd</label>
                    <input type="time" value={form.training_default_time}
                           onChange={(e) => handleChange('training_default_time', e.target.value)}
                           className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Hoe vaak</label>
                  <select value={form.training_interval_weeks}
                          onChange={(e) => handleChange('training_interval_weeks', Number(e.target.value))}
                          className={inputClass} style={inputStyle}>
                    <option value={1}>Elke week</option>
                    <option value={2}>Om de week</option>
                    <option value={3}>Elke 3 weken</option>
                    <option value={4}>Elke 4 weken</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.potjescup_enabled}
                     onChange={(e) => handleChange('potjescup_enabled', e.target.checked)}
                     className={checkboxClass} />
              <span className="text-sm">Potjescup</span>
            </label>

            {form.potjescup_enabled && (
              <div className="pl-6 space-y-1.5">
                <label className={labelClass}>Spelregels</label>
                <textarea
                  value={form.potjescup_rules_text}
                  onChange={(e) => handleChange('potjescup_rules_text', e.target.value)}
                  rows={6}
                  className={`${inputClass} resize-y`} style={inputStyle}
                />
                <p className="text-xs text-text-subtle">
                  Wordt getoond via het info-icoontje op de Potjescup-pagina. Scheid alinea's met een lege regel — elk team heeft vaak eigen regels.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.fluitbeurten_enabled}
                     onChange={(e) => handleChange('fluitbeurten_enabled', e.target.checked)}
                     className={checkboxClass} />
              <span className="text-sm">Fluitbeurten</span>
            </label>

            {form.fluitbeurten_enabled && (
              <div className="pl-6 space-y-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="fluitbeurten_mode" checked={form.fluitbeurten_mode === 'auto'}
                           onChange={() => handleChange('fluitbeurten_mode', 'auto')}
                           className={checkboxClass} />
                    Automatisch genereren
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="fluitbeurten_mode" checked={form.fluitbeurten_mode === 'manual'}
                           onChange={() => handleChange('fluitbeurten_mode', 'manual')}
                           className={checkboxClass} />
                    Alleen handmatig
                  </label>
                </div>

                {form.fluitbeurten_mode === 'auto' && (
                  <div className="space-y-2">
                    <select value={form.fluitbeurten_relative_to_match}
                            onChange={(e) => handleChange('fluitbeurten_relative_to_match', e.target.value)}
                            className="w-full px-2 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
                            style={{ border: '1px solid var(--color-border)' }}>
                      <option value="match_day">Op de wedstrijddag zelf (thuis)</option>
                      <option value="before">Een vaste dag vóór de wedstrijd</option>
                      <option value="after">Een vaste dag ná de wedstrijd</option>
                    </select>

                    {form.fluitbeurten_relative_to_match !== 'match_day' && (
                      <select value={form.fluitbeurten_day_of_week}
                              onChange={(e) => handleChange('fluitbeurten_day_of_week', Number(e.target.value))}
                              className="w-full px-2 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
                              style={{ border: '1px solid var(--color-border)' }}>
                        {DAY_NAMES_NL.map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <p className="text-xs text-text-subtle">
                  "Losse fluitbeurt toevoegen" blijft in beide standen beschikbaar als handmatig vangnet — handig omdat de exacte fluittijd vaak pas in de week zelf bekend is.
                </p>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}
        {saved && <p className="text-success text-sm">Instellingen opgeslagen!</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
        >
          <Save size={16} />
          {saving ? 'Opslaan...' : 'Instellingen opslaan'}
        </button>
      </form>
    </div>
  )
}
