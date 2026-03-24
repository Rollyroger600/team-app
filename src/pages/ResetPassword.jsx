import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle } from 'lucide-react'
import { resetPassword } from '../lib/auth'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error: resetError } = await resetPassword(email.trim())
    setLoading(false)

    if (resetError) {
      setError(resetError.message || 'Er is iets misgegaan. Probeer het opnieuw.')
      return
    }

    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Wachtwoord vergeten
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Vul je e-mailadres in om een reset-link te ontvangen
          </p>
        </div>

        <div className="rounded-2xl p-6 border"
             style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>

          {sent ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-400" />
              </div>
              <div>
                <p className="font-semibold mb-1">E-mail verstuurd!</p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  We hebben een reset-link gestuurd naar <span className="font-medium" style={{ color: 'var(--color-text)' }}>{email}</span>.
                  Controleer ook je spam-map.
                </p>
              </div>
              <Link
                to="/login"
                className="block w-full py-3 rounded-xl font-semibold text-sm text-center transition-opacity"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                Terug naar inloggen
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  E-mailadres
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jouw@email.nl"
                    autoFocus
                    autoComplete="email"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400"
                    style={{
                      backgroundColor: 'var(--color-surface-2)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}
              >
                {loading ? 'Bezig...' : 'Reset-link versturen'}
              </button>

              <Link
                to="/login"
                className="block text-center text-xs opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ← Terug naar inloggen
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
