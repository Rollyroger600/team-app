import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { checkEmailExists, signIn, resetPassword } from '../lib/auth'
import React from 'react'

const STEP_EMAIL = 'email'
const STEP_PASSWORD = 'password'
const STEP_NOT_FOUND = 'not_found'

type Step = typeof STEP_EMAIL | typeof STEP_PASSWORD | typeof STEP_NOT_FOUND

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(STEP_EMAIL)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { exists, error: checkError } = await checkEmailExists(email.trim())
    setLoading(false)

    if (checkError) {
      setError('Er is iets misgegaan. Probeer het opnieuw.')
      return
    }

    if (!exists) {
      setStep(STEP_NOT_FOUND)
      return
    }

    setStep(STEP_PASSWORD)
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')

    const { error: signInError } = await signIn(email.trim(), password)
    setLoading(false)

    if (signInError) {
      setError('Onjuist wachtwoord. Probeer het opnieuw.')
      return
    }

    navigate('/')
  }

  async function handleSendResetLink() {
    setLoading(true)
    await resetPassword(email.trim())
    setLoading(false)
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl bg-primary">
            🏑
          </div>
          <h1 className="text-2xl font-bold text-text">
            Hockey Team App
          </h1>
          <p className="text-sm mt-1 text-text-muted">
            Inloggen bij je team
          </p>
        </div>

        <div className="rounded-2xl p-6 border bg-surface border-border">

          {/* Stap 1: E-mail */}
          {step === STEP_EMAIL && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-text-muted">
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
                    className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400 bg-surface-2 border-border text-text"
                    required
                  />
                </div>
              </div>

              {error && <ErrorBox>{error}</ErrorBox>}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
              >
                {loading ? 'Bezig...' : 'Doorgaan'}
              </button>
            </form>
          )}

          {/* Stap 2: Wachtwoord */}
          {step === STEP_PASSWORD && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <p className="text-sm text-text-muted">
                Inloggen als <span className="font-medium text-text">{email}</span>
              </p>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-text-muted">
                  Wachtwoord
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Jouw wachtwoord"
                    autoFocus
                    autoComplete="current-password"
                    className="w-full pl-9 pr-10 py-3 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400 bg-surface-2 border-border text-text"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <ErrorBox>{error}</ErrorBox>}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
              >
                {loading ? 'Bezig...' : 'Inloggen'}
              </button>

              {/* Nog geen wachtwoord / vergeten */}
              {!resetSent ? (
                <div className="text-center pt-1 border-t border-border">
                  <p className="text-xs mb-2 text-text-muted">
                    Eerste keer inloggen of wachtwoord vergeten?
                  </p>
                  <button
                    type="button"
                    onClick={handleSendResetLink}
                    disabled={loading}
                    className="text-xs text-amber-400 hover:text-amber-300 underline disabled:opacity-50"
                  >
                    {loading ? 'Bezig...' : 'Stuur mij een wachtwoord-link'}
                  </button>
                </div>
              ) : (
                <div className="text-center text-xs p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                  ✓ Link verstuurd naar {email} — check je inbox
                </div>
              )}

              <button
                type="button"
                onClick={() => { setStep(STEP_EMAIL); setError(''); setPassword(''); setResetSent(false) }}
                className="w-full text-xs opacity-50 hover:opacity-80 text-text-muted"
              >
                ← Ander e-mailadres
              </button>
            </form>
          )}

          {/* Niet gevonden */}
          {step === STEP_NOT_FOUND && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400 mb-1">E-mail niet gevonden</p>
                  <p className="text-text-muted">
                    <span className="font-medium text-text">{email}</span> is niet bekend.
                    Neem contact op met je aanvoerder om toegang te krijgen.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setStep(STEP_EMAIL); setEmail('') }}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-surface-2 text-text"
              >
                ← Ander e-mailadres proberen
              </button>
            </div>
          )}
        </div>
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
