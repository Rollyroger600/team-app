// DEV-only component — alleen zichtbaar in development mode
// Snel wisselen tussen testprofielen zonder uit/inloggen
import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../stores/useAuthStore'

const DEV_PASSWORD = 'Test1234!'

const TEST_PLAYERS = [
  { email: 'rogierhaanraadts@gmail.com', name: 'Rogier (admin)', password: null },
  { email: 'tim.vanderberg@test.nl',     name: 'Tim van der Berg' },
  { email: 'sander.devries@test.nl',     name: 'Sander de Vries' },
  { email: 'joost.bakker@test.nl',       name: 'Joost Bakker' },
  { email: 'martijn.smits@test.nl',      name: 'Martijn Smits' },
  { email: 'bas.janssen@test.nl',        name: 'Bas Janssen' },
  { email: 'rick.vandijk@test.nl',       name: 'Rick van Dijk' },
  { email: 'thomas.meijer@test.nl',      name: 'Thomas Meijer' },
  { email: 'pieter.degroot@test.nl',     name: 'Pieter de Groot' },
  { email: 'wouter.visser@test.nl',      name: 'Wouter Visser' },
  { email: 'lars.vandenberg@test.nl',    name: 'Lars van den Berg' },
  { email: 'niels.bosman@test.nl',       name: 'Niels Bosman' },
  { email: 'jeroen.peters@test.nl',      name: 'Jeroen Peters' },
  { email: 'ruben.kuijpers@test.nl',     name: 'Ruben Kuijpers' },
  { email: 'daan.hendriks@test.nl',      name: 'Daan Hendriks' },
  { email: 'kevin.vanleeuwen@test.nl',   name: 'Kevin van Leeuwen' },
  { email: 'marc.willems@test.nl',       name: 'Marc Willems' },
  { email: 'stefan.dejong@test.nl',      name: 'Stefan de Jong' },
  { email: 'frank.hoekstra@test.nl',     name: 'Frank Hoekstra' },
  { email: 'arjen.mulder@test.nl',       name: 'Arjen Mulder' },
  { email: 'paul.schouten@test.nl',      name: 'Paul Schouten' },
  { email: 'michel.brouwers@test.nl',    name: 'Michel Brouwers' },
  { email: 'dennis.vermeer@test.nl',     name: 'Dennis Vermeer' },
]

export default function DevSwitcher() {
  if (!import.meta.env.DEV) return null

  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(null)
  const [pwPrompt, setPwPrompt] = useState(null) // email waarvoor pw gevraagd wordt
  const [pwValue, setPwValue] = useState('')
  const [error, setError] = useState('')
  const pwRef = useRef(null)

  async function switchTo(email, password) {
    setSwitching(email)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setSwitching(null)
      return
    }
    setSwitching(null)
    setPwPrompt(null)
    setPwValue('')
    setOpen(false)
  }

  function handleClick(player) {
    if (player.email === user?.email) return
    const pw = 'password' in player ? player.password : DEV_PASSWORD
    if (pw === null) {
      // Wachtwoord onbekend → toon inline input
      setPwPrompt(player.email)
      setPwValue('')
      setError('')
      setTimeout(() => pwRef.current?.focus(), 50)
    } else {
      switchTo(player.email, pw)
    }
  }

  return (
    <div className="fixed bottom-20 right-3 z-50">
      {open && (
        <div
          className="mb-2 rounded-xl border shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#0f172a', borderColor: '#1e293b', width: 230 }}
        >
          <div className="px-3 py-2 border-b text-xs font-bold text-amber-400" style={{ borderColor: '#1e293b' }}>
            🛠 Dev — wissel profiel
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {TEST_PLAYERS.map((p) => {
              const isActive = p.email === user?.email
              const isPrompting = pwPrompt === p.email
              const isSwitching = switching === p.email

              return (
                <div key={p.email}>
                  <button
                    onClick={() => !isActive && !isSwitching && handleClick(p)}
                    disabled={!!switching || isActive}
                    className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{ color: isActive ? '#f59e0b' : '#94a3b8' }}
                  >
                    {isSwitching ? '⏳ ' : isActive ? '● ' : '○ '}
                    {p.name}
                    {'password' in p && p.password === null && !isActive && (
                      <span className="ml-1 text-slate-600">🔑</span>
                    )}
                  </button>

                  {/* Inline wachtwoord prompt */}
                  {isPrompting && (
                    <div className="px-3 pb-2 space-y-1.5">
                      <input
                        ref={pwRef}
                        type="password"
                        value={pwValue}
                        onChange={e => setPwValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && pwValue && switchTo(p.email, pwValue)}
                        placeholder="Wachtwoord"
                        className="w-full px-2 py-1 rounded text-xs outline-none"
                        style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
                      />
                      {error && <p className="text-red-400 text-xs">{error}</p>}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => pwValue && switchTo(p.email, pwValue)}
                          disabled={!pwValue || !!switching}
                          className="flex-1 py-1 rounded text-xs font-semibold disabled:opacity-40"
                          style={{ backgroundColor: '#f59e0b', color: '#0f172a' }}
                        >
                          {switching ? '⏳' : 'Inloggen'}
                        </button>
                        <button
                          onClick={() => { setPwPrompt(null); setPwValue(''); setError('') }}
                          className="px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
                          style={{ backgroundColor: '#1e293b' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-3 py-2 border-t text-xs text-slate-600" style={{ borderColor: '#1e293b' }}>
            standaard ww: {DEV_PASSWORD}
          </div>
        </div>
      )}

      <button
        onClick={() => { setOpen(o => !o); setPwPrompt(null); setError('') }}
        className="w-10 h-10 rounded-full border text-xs font-bold shadow-lg transition-colors"
        style={{
          backgroundColor: open ? '#1e3a5f' : '#0f172a',
          borderColor: '#f59e0b',
          color: '#f59e0b',
        }}
        title="Dev: wissel profiel"
      >
        🛠
      </button>
    </div>
  )
}
