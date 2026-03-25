import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../stores/useAuthStore'
import useTeamStore from '../../stores/useTeamStore'

export default function AdminAnnouncements() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { activeTeam } = useTeamStore()
  const [form, setForm] = useState({ title: '', body: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.body.trim() || !activeTeam?.id || !user?.id) return
    setSaving(true)
    setError('')

    const { error: insertError } = await supabase.from('announcements').insert({
      team_id: activeTeam.id,
      author_id: user.id,
      title: form.title.trim() || null,
      body: form.body.trim()
    })

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    navigate('/announcements')
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400"
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Bericht plaatsen</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-slate-400">Titel (optioneel)</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Korte titel..."
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-slate-400">Bericht *</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm(p => ({ ...p, body: e.target.value }))}
              placeholder="Typ hier je bericht..."
              rows={6}
              className={inputClass + ' resize-none'}
              style={inputStyle}
              required
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving || !form.body.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
        >
          <Send size={16} />
          {saving ? 'Versturen...' : 'Bericht versturen'}
        </button>
      </form>
    </div>
  )
}
