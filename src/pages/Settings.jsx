import { useState } from 'react'
import { LogOut, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'

const POSITIONS = [
  { value: 'goalkeeper',  label: 'Keeper' },
  { value: 'defender',    label: 'Verdediger' },
  { value: 'midfielder',  label: 'Middenvelder' },
  { value: 'forward',     label: 'Aanvaller' },
]

export default function Settings() {
  const { user, profile, loadProfile, signOut } = useAuthStore()
  const { activeTeam, activeClub } = useTeamStore()
  const [signingOut, setSigningOut] = useState(false)
  const [nickname, setNickname] = useState(profile?.nickname || '')
  const [position, setPosition] = useState(profile?.position || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!user?.id) return
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: err } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() || null, position: position || null })
      .eq('id', user.id)

    setSaving(false)
    if (err) { setError(err.message); return }

    await loadProfile(user)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400"
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Instellingen</h1>

      {/* Profile card */}
      <div className="rounded-xl p-4 border bg-surface border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 bg-primary">
            {profile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold">{profile?.full_name || 'Onbekend'}</p>
            <p className="text-sm text-slate-400">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Bijnaam <span className="text-slate-600">(getoond in opstelling en beschikbaarheid)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder={profile?.full_name?.split(' ')[0] || 'Bijnaam'}
              className={inputClass}
              style={inputStyle}
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Voorkeurspositie</label>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPosition(p => p === value ? '' : value)}
                  className={`py-2 rounded-xl border text-sm transition-all ${
                    position === value
                      ? 'border-amber-400 text-amber-400 bg-amber-400/10'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {saved && <p className="text-green-400 text-xs">Opgeslagen!</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
          >
            <Save size={15} />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>

      {/* Team info */}
      <div className="rounded-xl border overflow-hidden bg-surface border-border">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Team</p>
        </div>
        <div className="px-4 py-3">
          <p className="font-medium">{activeTeam?.name || 'Geen team'}</p>
          {activeClub && <p className="text-sm text-slate-400">{activeClub.name}</p>}
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-xl border overflow-hidden bg-surface border-border">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          <LogOut size={18} className="text-red-400" />
          <span className="text-red-400 font-medium">{signingOut ? 'Uitloggen...' : 'Uitloggen'}</span>
        </button>
      </div>

      <p className="text-center text-xs text-slate-600 pt-2">Hockey Team App v1.0.0</p>
    </div>
  )
}
