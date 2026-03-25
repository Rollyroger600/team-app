// DevSwitcher — snel wisselen tussen testprofielen (alleen in lokale dev)
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../stores/useAuthStore'

const TEST_PLAYERS = [
  { email: 'rogierhaanraadts@gmail.com', name: 'Rogier (admin)' },
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
  // Only render in local development — never in production builds
  if (!import.meta.env.DEV) return null

  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(null)
  const [error, setError] = useState('')

  async function switchTo(email) {
    if (email === user?.email) return
    setSwitching(email)
    setError('')

    const { data, error: fnError } = await supabase.functions.invoke('dev-switch-user', {
      body: { email },
    })

    if (fnError || data?.error) {
      setError(data?.error || fnError?.message || 'Fout bij wisselen')
      setSwitching(null)
      return
    }

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: data.hashed_token,
      type: 'email',
    })

    if (verifyErr) {
      setError(verifyErr.message)
      setSwitching(null)
      return
    }

    setSwitching(null)
    setOpen(false)
  }

  return (
    <div className="fixed bottom-20 right-3 z-50">
      {open && (
        <div
          className="mb-2 rounded-xl border shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#0f172a', borderColor: '#1e293b', width: 220 }}
        >
          <div className="px-3 py-2 border-b text-xs font-bold text-amber-400" style={{ borderColor: '#1e293b' }}>
            Wissel profiel
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {TEST_PLAYERS.map((p) => {
              const isActive = p.email === user?.email
              const isSwitching = switching === p.email
              return (
                <button
                  key={p.email}
                  onClick={() => switchTo(p.email)}
                  disabled={!!switching || isActive}
                  className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{ color: isActive ? '#f59e0b' : '#94a3b8' }}
                >
                  {isSwitching ? '⏳ ' : isActive ? '● ' : '○ '}
                  {p.name}
                </button>
              )
            })}
          </div>
          {error && (
            <div className="px-3 py-2 border-t text-xs text-red-400" style={{ borderColor: '#1e293b' }}>
              {error}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => { setOpen(o => !o); setError('') }}
        className="w-10 h-10 rounded-full border text-xs font-bold shadow-lg transition-colors"
        style={{ backgroundColor: open ? '#1e3a5f' : '#0f172a', borderColor: '#f59e0b', color: '#f59e0b' }}
        title="Wissel profiel (dev only)"
      >
        🛠
      </button>
    </div>
  )
}
