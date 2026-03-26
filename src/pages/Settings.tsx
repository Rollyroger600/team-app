import { useState } from 'react'
import { LogOut, Save, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { changePin } from '../lib/auth'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'

interface PositionOption {
  value: string
  label: string
}

const POSITIONS: PositionOption[] = [
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

  // PIN change
  const [showPinSection, setShowPinSection] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmNewPin, setConfirmNewPin] = useState('')
  const [showPins, setShowPins] = useState(false)
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSaved, setPinSaved] = useState(false)

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

  async function handleChangePin() {
    if (newPin !== confirmNewPin) { setPinError('Nieuwe PINs komen niet overeen'); return }
    if (!/^\d{4,6}$/.test(newPin)) { setPinError('PIN moet 4 tot 6 cijfers zijn'); return }
    setPinSaving(true)
    setPinError('')
    setPinSaved(false)
    const result = await changePin(currentPin, newPin)
    setPinSaving(false)
    if (result.error) { setPinError(result.error); return }
    setCurrentPin('')
    setNewPin('')
    setConfirmNewPin('')
    setPinSaved(true)
    setTimeout(() => { setPinSaved(false); setShowPinSection(false) }, 2500)
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

      {/* Change PIN */}
      <div className="rounded-xl border overflow-hidden bg-surface border-border">
        <button
          onClick={() => { setShowPinSection(v => !v); setPinError('') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
        >
          <Lock size={18} className="text-amber-400" />
          <span className="font-medium">Pincode wijzigen</span>
        </button>
        {showPinSection && (
          <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
            {(['Huidige PIN', 'Nieuwe PIN', 'Bevestig nieuwe PIN'] as const).map((label, i) => {
              const vals = [currentPin, newPin, confirmNewPin]
              const setters = [setCurrentPin, setNewPin, setConfirmNewPin]
              return (
                <div key={i}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <div className="relative">
                    <input
                      type={showPins ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={vals[i]}
                      onChange={e => setters[i](e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className={inputClass}
                      style={inputStyle}
                    />
                    {i === 2 && (
                      <button type="button" onClick={() => setShowPins(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80">
                        {showPins ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {pinError && <p className="text-red-400 text-xs">{pinError}</p>}
            {pinSaved && <p className="text-green-400 text-xs">PIN gewijzigd!</p>}
            <button
              onClick={handleChangePin}
              disabled={pinSaving || !currentPin || !newPin || !confirmNewPin}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text mt-1"
            >
              <Lock size={14} />
              {pinSaving ? 'Bezig...' : 'PIN wijzigen'}
            </button>
          </div>
        )}
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
