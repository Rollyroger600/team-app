import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ChevronLeft } from 'lucide-react'
import {
  getPlayersForLogin,
  getPlayersForLoginBySlug,
  loginWithPin,
  setupPin,
  type LoginPlayer,
} from '../lib/auth'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import React from 'react'

type Step = 'team' | 'name' | 'pin' | 'setup_pin'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loadProfile } = useAuthStore()

  const [step, setStep] = useState<Step>('team')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1 — team selection
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([])
  const [teams, setTeams] = useState<{ id: string; name: string; club_id: string | null }[]>([])
  const [selectedClubId, setSelectedClubId] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')

  // Step 2 — name picker
  const [players, setPlayers] = useState<LoginPlayer[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<LoginPlayer | null>(null)

  // Step 3 & 4 — PIN
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter')

  // ── On mount: check for slug params and pre-load team ─────────────────────
  useEffect(() => {
    const clubSlug = searchParams.get('club')
    const teamSlug = searchParams.get('team')

    if (clubSlug && teamSlug) {
      loadPlayersBySlug(clubSlug, teamSlug)
    } else {
      loadClubs()
    }
  }, [])

  async function loadClubs() {
    const { data } = await supabase.from('clubs').select('id, name').order('name')
    setClubs(data ?? [])
  }

  async function loadTeamsForClub(clubId: string) {
    const { data } = await supabase
      .from('teams')
      .select('id, name, club_id')
      .eq('club_id', clubId)
      .order('name')
    setTeams(data ?? [])
  }

  async function loadPlayersByTeamId(teamId: string) {
    setLoading(true)
    setError('')
    const { players: list, error: err } = await getPlayersForLogin(teamId)
    setLoading(false)
    if (err) { setError(err); return }
    setPlayers(list)
    setStep('name')
  }

  async function loadPlayersBySlug(clubSlug: string, teamSlug: string) {
    setLoading(true)
    setError('')
    const { players: list, team_id, error: err } = await getPlayersForLoginBySlug(clubSlug, teamSlug)
    setLoading(false)
    if (err || !team_id) { setError(err ?? 'Team niet gevonden'); setStep('team'); loadClubs(); return }
    setSelectedTeamId(team_id)
    setPlayers(list)
    setStep('name')
  }

  // ── After login: load profile then navigate ───────────────────────────────
  async function finishLogin() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('Sessie kon niet worden opgestart. Probeer opnieuw.')
      setLoading(false)
      return
    }
    // Start loadProfile in background — it synchronously sets user first, then
    // fires async DB queries. Navigate immediately so ProtectedRoute sees the user.
    void loadProfile(session.user)
    navigate('/')
  }

  // ── Step 1: Team selection ─────────────────────────────────────────────────
  function handleClubChange(clubId: string) {
    setSelectedClubId(clubId)
    setSelectedTeamId('')
    setTeams([])
    if (clubId) loadTeamsForClub(clubId)
  }

  async function handleTeamConfirm() {
    if (!selectedTeamId) return
    await loadPlayersByTeamId(selectedTeamId)
  }

  // ── Step 2: Name picker ───────────────────────────────────────────────────
  function handleSelectPlayer(player: LoginPlayer) {
    setSelectedPlayer(player)
    setPin('')
    setConfirmPin('')
    setPinStep('enter')
    setError('')
    // has_set_pin is included in the name-picker response — no extra API call needed
    setStep(player.has_set_pin ? 'pin' : 'setup_pin')
  }

  // ── Step 3: PIN entry ─────────────────────────────────────────────────────
  async function handlePinSubmit() {
    if (pin.length < 4) return
    setLoading(true)
    setError('')
    const result = await loginWithPin(selectedPlayer!.player_id, pin)
    setLoading(false)

    if (result.error) { setError(result.error); setPin(''); return }
    if (result.needs_pin_setup) { setStep('setup_pin'); return }
    if (result.session) await finishLogin()
  }

  // ── Step 4: First-time PIN setup ──────────────────────────────────────────
  async function handleSetupPinSubmit() {
    if (pinStep === 'enter') {
      if (pin.length < 4) return
      setPinStep('confirm')
      return
    }
    // confirm step
    if (pin !== confirmPin) {
      setError('PINs komen niet overeen. Probeer opnieuw.')
      setConfirmPin('')
      return
    }
    setLoading(true)
    setError('')
    const result = await setupPin(selectedPlayer!.player_id, pin)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    if (result.session) await finishLogin()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl bg-primary">
            🏑
          </div>
          <h1 className="text-2xl font-bold text-text">Hockey Team App</h1>
          <p className="text-sm mt-1 text-text-muted">Inloggen bij je team</p>
        </div>

        <div className="rounded-2xl p-6 border bg-surface border-border">

          {/* ── Step 1: Team selectie ── */}
          {step === 'team' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-text">Kies jouw team</h2>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-text-muted">Club</label>
                <select
                  value={selectedClubId}
                  onChange={e => handleClubChange(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border text-sm outline-none bg-surface-2 border-border text-text"
                >
                  <option value="">— Selecteer club —</option>
                  {clubs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {teams.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-text-muted">Team</label>
                  <select
                    value={selectedTeamId}
                    onChange={e => setSelectedTeamId(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border text-sm outline-none bg-surface-2 border-border text-text"
                  >
                    <option value="">— Selecteer team —</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && <ErrorBox>{error}</ErrorBox>}

              <button
                onClick={handleTeamConfirm}
                disabled={!selectedTeamId || loading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
              >
                {loading ? 'Bezig...' : 'Doorgaan'}
              </button>
            </div>
          )}

          {/* ── Step 2: Naam kiezen ── */}
          {step === 'name' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep('team'); setError('') }}
                  className="opacity-50 hover:opacity-80">
                  <ChevronLeft size={18} />
                </button>
                <h2 className="font-semibold text-text">Wie ben jij?</h2>
              </div>

              {players.length === 0 && (
                <p className="text-sm text-text-muted text-center py-4">Geen spelers gevonden</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {players.map(p => (
                  <button
                    key={p.player_id}
                    onClick={() => handleSelectPlayer(p)}
                    className="flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-xl border text-sm font-medium transition-colors bg-surface-2 border-border text-text hover:border-amber-400 hover:bg-amber-400/10"
                  >
                    {p.jersey_number != null && (
                      <span className="text-xs font-bold text-text-muted">#{p.jersey_number}</span>
                    )}
                    <span>{p.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: PIN invoeren ── */}
          {step === 'pin' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep('name'); setPin(''); setError('') }}
                  className="opacity-50 hover:opacity-80">
                  <ChevronLeft size={18} />
                </button>
                <h2 className="font-semibold text-text">
                  Hoi {selectedPlayer?.display_name}!
                </h2>
              </div>

              <p className="text-sm text-text-muted">Voer jouw pincode in</p>

              <PinInput
                value={pin}
                onChange={setPin}
                onSubmit={handlePinSubmit}
                loading={loading}
              />

              {error && <ErrorBox>{error}</ErrorBox>}

              <button
                onClick={handlePinSubmit}
                disabled={pin.length < 4 || loading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
              >
                {loading ? 'Bezig...' : 'Inloggen'}
              </button>

              <p className="text-xs text-center text-text-muted">
                PIN vergeten? Neem contact op met je admin.
              </p>
            </div>
          )}

          {/* ── Step 4: Eerste keer PIN instellen ── */}
          {step === 'setup_pin' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {pinStep === 'enter' && (
                  <button onClick={() => { setStep('name'); setPin(''); setConfirmPin(''); setError('') }}
                    className="opacity-50 hover:opacity-80">
                    <ChevronLeft size={18} />
                  </button>
                )}
                <div>
                  <p className="text-xs text-text-muted mb-0.5">
                    {selectedPlayer?.display_name}
                  </p>
                  <h2 className="font-semibold text-text">
                    {pinStep === 'enter' ? 'Kies een pincode' : 'Bevestig je pincode'}
                  </h2>
                </div>
              </div>
              <p className="text-sm text-text-muted">
                {pinStep === 'enter'
                  ? 'Je logt voortaan in met deze pincode. Onthoud hem goed!'
                  : 'Voer je pincode nogmaals in ter bevestiging.'}
              </p>

              <PinInput
                value={pinStep === 'enter' ? pin : confirmPin}
                onChange={pinStep === 'enter' ? setPin : setConfirmPin}
                onSubmit={handleSetupPinSubmit}
                loading={loading}
              />

              {error && <ErrorBox>{error}</ErrorBox>}

              <button
                onClick={handleSetupPinSubmit}
                disabled={(pinStep === 'enter' ? pin : confirmPin).length < 4 || loading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
              >
                {loading ? 'Bezig...' : pinStep === 'enter' ? 'Doorgaan' : 'Pincode instellen'}
              </button>

              {pinStep === 'confirm' && (
                <button
                  type="button"
                  onClick={() => { setPinStep('enter'); setConfirmPin(''); setError('') }}
                  className="w-full text-xs opacity-50 hover:opacity-80 text-text-muted"
                >
                  ← Andere pincode kiezen
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PinInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
}

function PinInput({ value, onChange, onSubmit, loading }: PinInputProps) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

  function handleKey(d: number | 'del') {
    if (loading) return
    if (d === 'del') {
      onChange(value.slice(0, -1))
    } else {
      const next = value + String(d)
      if (next.length <= 6) onChange(next)
      if (next.length === 6) setTimeout(onSubmit, 100)
    }
  }

  return (
    <div className="space-y-4">
      {/* PIN dots */}
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-all ${
              i < value.length
                ? 'bg-amber-400 border-amber-400'
                : 'border-border bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <button
            key={d}
            onClick={() => handleKey(d)}
            className="py-4 rounded-xl text-lg font-semibold transition-colors bg-surface-2 hover:bg-border text-text active:scale-95"
          >
            {d}
          </button>
        ))}
        {/* empty slot */}
        <div />
        <button
          onClick={() => handleKey(0)}
          className="py-4 rounded-xl text-lg font-semibold transition-colors bg-surface-2 hover:bg-border text-text active:scale-95"
        >
          0
        </button>
        <button
          onClick={() => handleKey('del')}
          className="py-4 rounded-xl text-lg font-semibold transition-colors bg-surface-2 hover:bg-border text-text active:scale-95"
        >
          ⌫
        </button>
      </div>
    </div>
  )
}

interface ErrorBoxProps {
  children: React.ReactNode
}

function ErrorBox({ children }: ErrorBoxProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle size={14} className="flex-shrink-0" />
      {children}
    </div>
  )
}
