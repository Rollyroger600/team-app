import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { PinInput, ErrorBox } from '../components/ui/PinInput'
import {
  resolveAccessCode,
  activateAccessCode,
  linkAccessCode,
  applySession,
  storeCode,
  clearStoredCode,
  type ResolvedCode,
} from '../lib/accessCodes'
import { loginWithPin } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { storeActiveTeamId } from '../lib/activeTeam'
import useAuthStore from '../stores/useAuthStore'

/**
 * /i/:code — de persoonlijke uitnodigingslink.
 *
 * Drie uitkomsten, afhankelijk van de code en of je al ingelogd bent:
 *
 *  1. Nog niet verzilverd, niet ingelogd  → PIN kiezen, account ontstaat.
 *  2. Al verzilverd                       → PIN invoeren, gewone login.
 *  3. Nog niet verzilverd, wél ingelogd   → koppelen aan je bestaande profiel.
 *     Dat is de multi-team-route: één account, twee teams.
 *
 * Het scherm toont alleen de naam die bij déze code hoort. Geen namenlijst — dat
 * is de hele reden dat deze pagina bestaat.
 */
export default function Invite() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { loadProfile } = useAuthStore()

  const [resolved, setResolved] = useState<ResolvedCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fatal, setFatal] = useState('')

  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter')

  // Al ingelogd? Dan is dit een koppeling en geen nieuwe registratie.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [linked, setLinked] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setSignedIn(!!session)

      if (!code) { setFatal('Geen code in de link'); setLoading(false); return }
      const result = await resolveAccessCode(code)
      if (cancelled) return

      if (result.error) {
        // Wissen is hier load-bearing: /login stuurt een toestel met onthouden code
        // terug naar /i/<code>. Blijft een ingetrokken code staan, dan pingpongen
        // die twee schermen en komt niemand meer bij de namenlijst.
        clearStoredCode()
        setFatal(result.error)
        setLoading(false)
        return
      }
      setResolved(result)
      // Onthouden zodat dit toestel de volgende keer direct op het PIN-scherm komt.
      storeCode(result.code)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [code])

  const finish = useCallback(async (teamId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('Sessie kon niet worden opgestart. Probeer opnieuw.')
      return
    }
    storeActiveTeamId(teamId)
    await loadProfile(session.user)
    navigate('/')
  }, [loadProfile, navigate])

  // ── Al verzilverde code: gewone PIN-login ──────────────────────────────────
  async function handleLogin(value: string) {
    if (!resolved?.player_id || value.length < 4) return
    setBusy(true); setError('')
    const result = await loginWithPin(resolved.player_id, value)
    setBusy(false)
    if (result.error) { setError(result.error); setPin(''); return }
    if (result.needs_pin_setup) { setPinStep('enter'); setPin(''); return }
    if (result.session) await finish(resolved.team_id)
  }

  // ── Nieuwe code: PIN kiezen en bevestigen ──────────────────────────────────
  async function handleActivate(value: string) {
    if (pinStep === 'enter') {
      if (value.length < 4) return
      setPin(value); setPinStep('confirm'); setError('')
      return
    }
    if (value !== pin) {
      setError('De pincodes komen niet overeen. Probeer opnieuw.')
      setConfirmPin('')
      return
    }
    setBusy(true); setError('')
    const result = await activateAccessCode(resolved!.code, pin)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      // Iemand anders was net eerder, of de link was al in gebruik: terug naar
      // het begin, dan komt de gewone PIN-login in beeld.
      if (result.already_activated) {
        setPin(''); setConfirmPin(''); setPinStep('enter')
        const again = await resolveAccessCode(resolved!.code)
        if (!again.error) setResolved(again)
      }
      return
    }
    if (result.session) {
      await applySession(result.session)
      await finish(resolved!.team_id)
    }
  }

  // ── Ingelogd + openstaande code: koppelen aan bestaand profiel ─────────────
  async function handleLink() {
    setBusy(true); setError('')
    const result = await linkAccessCode(resolved!.code)
    setBusy(false)
    if (result.error) { setError(result.error); return }
    setLinked(true)
    storeActiveTeamId(result.team_id ?? resolved!.team_id)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user)
    navigate('/')
  }

  const teamLabel = [resolved?.club_name, resolved?.team_name].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl bg-primary text-primary-text">
            🏑
          </div>
          <h1 className="text-2xl font-bold text-text">Hockey Team App</h1>
          {teamLabel && <p className="text-sm mt-1 text-text-muted">{teamLabel}</p>}
        </div>

        <div className="rounded-2xl p-6 border bg-surface border-border space-y-4">
          {loading && (
            <p className="text-sm text-center text-text-muted py-6">Link controleren...</p>
          )}

          {!loading && fatal && (
            <div className="space-y-4">
              <ErrorBox>{fatal}</ErrorBox>
              <p className="text-sm text-text-muted">
                Vraag je beheerder om een nieuwe persoonlijke link.
              </p>
              <Link
                to="/login"
                className="block w-full py-3 rounded-xl font-semibold text-sm text-center bg-surface-2 text-text"
              >
                Inloggen met je naam
              </Link>
            </div>
          )}

          {!loading && !fatal && resolved && (
            <>
              <div>
                <h2 className="font-semibold text-text">Hoi {resolved.display_name}!</h2>
                <p className="text-sm text-text-muted mt-0.5">
                  {signedIn && !resolved.activated
                    ? 'Je bent al ingelogd. Wil je dit team toevoegen aan je account?'
                    : resolved.activated
                      ? 'Voer jouw pincode in'
                      : pinStep === 'enter'
                        ? 'Kies een pincode van 4 tot 6 cijfers'
                        : 'Herhaal je pincode'}
                </p>
              </div>

              {/* Ingelogd + nog niet verzilverd → koppelen */}
              {signedIn && !resolved.activated && !linked && (
                <div className="space-y-3">
                  {error && <ErrorBox>{error}</ErrorBox>}
                  <button
                    onClick={handleLink}
                    disabled={busy}
                    className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
                  >
                    {busy ? 'Bezig...' : `${resolved.team_name ?? 'Dit team'} toevoegen`}
                  </button>
                  <Link to="/" className="block text-center text-xs text-text-muted">
                    Nee, terug naar de app
                  </Link>
                </div>
              )}

              {/* Al verzilverd → gewone PIN-login */}
              {(!signedIn || resolved.activated) && resolved.activated && (
                <>
                  <PinInput value={pin} onChange={setPin} onComplete={handleLogin} loading={busy} />
                  {error && <ErrorBox>{error}</ErrorBox>}
                  <button
                    onClick={() => handleLogin(pin)}
                    disabled={pin.length < 4 || busy}
                    className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
                  >
                    {busy ? 'Bezig...' : 'Inloggen'}
                  </button>
                  <p className="text-xs text-center text-text-muted">
                    PIN vergeten? Vraag je beheerder om een reset.
                  </p>
                </>
              )}

              {/* Nog niet verzilverd en niet ingelogd → PIN kiezen */}
              {!signedIn && !resolved.activated && (
                <>
                  <PinInput
                    value={pinStep === 'enter' ? pin : confirmPin}
                    onChange={pinStep === 'enter' ? setPin : setConfirmPin}
                    onComplete={handleActivate}
                    loading={busy}
                  />
                  {error && <ErrorBox>{error}</ErrorBox>}
                  <button
                    onClick={() => handleActivate(pinStep === 'enter' ? pin : confirmPin)}
                    disabled={(pinStep === 'enter' ? pin : confirmPin).length < 4 || busy}
                    className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 bg-secondary text-secondary-text"
                  >
                    {busy ? 'Bezig...' : pinStep === 'enter' ? 'Volgende' : 'Account aanmaken'}
                  </button>
                  {pinStep === 'confirm' && (
                    <button
                      onClick={() => { setPinStep('enter'); setPin(''); setConfirmPin(''); setError('') }}
                      className="w-full text-xs text-text-muted"
                    >
                      Andere pincode kiezen
                    </button>
                  )}
                </>
              )}

              {/* Ontsnappingsroute. Zonder dit zit een gedeeld toestel vast aan de
                  onthouden code en kan een ander er niet meer bij. */}
              {!signedIn && (
                <button
                  onClick={() => { clearStoredCode(); navigate('/login', { replace: true }) }}
                  className="w-full text-xs text-text-muted pt-1"
                >
                  Ben jij dit niet? Inloggen met je naam
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
