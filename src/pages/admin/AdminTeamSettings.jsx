import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'

export default function AdminTeamSettings() {
  const { activeTeam, refreshTeam } = useTeamStore()
  const [form, setForm] = useState({
    name: '',
    gathering_lead_time: 30,
    travel_buffer_minutes: 10,
    match_squad_size: 16,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeTeam?.id) return
    setForm({
      name: activeTeam.name || '',
      gathering_lead_time: activeTeam.gathering_lead_time ?? 30,
      travel_buffer_minutes: activeTeam.travel_buffer_minutes ?? 10,
      match_squad_size: activeTeam.match_squad_size ?? 16,
    })
    setLoading(false)
  }, [activeTeam?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!activeTeam?.id) return
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: updateError } = await supabase
      .from('teams')
      .update({
        name: form.name,
        gathering_lead_time: Number(form.gathering_lead_time),
        travel_buffer_minutes: Number(form.travel_buffer_minutes),
        match_squad_size: Number(form.match_squad_size),
      })
      .eq('id', activeTeam.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await refreshTeam(activeTeam.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400"
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }
  const labelClass = "block text-sm font-medium mb-1.5 text-slate-400"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-secondary)' }} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Team instellingen</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl p-4 border space-y-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wide">Algemeen</h2>

          <div>
            <label className={labelClass}>Teamnaam</label>
            <input type="text" value={form.name}
                   onChange={(e) => handleChange('name', e.target.value)}
                   className={inputClass} style={inputStyle} required />
          </div>

        </div>

        <div className="rounded-xl p-4 border space-y-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wide">Verzameltijden</h2>

          <div>
            <label className={labelClass}>Aanwezig zijn voor aanvang (minuten)</label>
            <input type="number" min="0" max="120" value={form.gathering_lead_time}
                   onChange={(e) => handleChange('gathering_lead_time', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-slate-500 mt-1">Standaard: 30 minuten voor aanvang</p>
          </div>

          <div>
            <label className={labelClass}>Reisbuffer (minuten)</label>
            <input type="number" min="0" max="60" value={form.travel_buffer_minutes}
                   onChange={(e) => handleChange('travel_buffer_minutes', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-slate-500 mt-1">Extra buffer bovenop reistijd voor uitwedstrijden</p>
          </div>

          <div>
            <label className={labelClass}>Selectiegrootte</label>
            <input type="number" min="1" max="30" value={form.match_squad_size}
                   onChange={(e) => handleChange('match_squad_size', e.target.value)}
                   className={inputClass} style={inputStyle} />
            <p className="text-xs text-slate-500 mt-1">Aantal spelers in de wedstrijdselectie</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {saved && <p className="text-green-400 text-sm">Instellingen opgeslagen!</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
        >
          <Save size={16} />
          {saving ? 'Opslaan...' : 'Instellingen opslaan'}
        </button>
      </form>
    </div>
  )
}
