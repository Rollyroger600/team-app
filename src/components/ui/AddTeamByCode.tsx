import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, AlertCircle, Check } from 'lucide-react'
import { linkAccessCode, normalizeCode, formatCode } from '../../lib/accessCodes'
import { storeActiveTeamId } from '../../lib/activeTeam'
import { supabase } from '../../lib/supabase'
import useAuthStore from '../../stores/useAuthStore'

/**
 * "Team toevoegen met een code", in Instellingen.
 *
 * Bestaat omdat de link alléén niet genoeg is. Wie de app als homescherm-app heeft
 * geïnstalleerd en een uitnodigingslink in WhatsApp aantikt, komt in de browser
 * terecht — en die heeft op iOS een aparte opslag, dus daar is hij niet ingelogd.
 * De uitnodigingspagina ziet dan een uitgelogde bezoeker en biedt "kies een
 * pincode" aan, wat een tweede account zou maken. Precies de dubbele-Hidde die
 * deze hele stap moest voorkomen.
 *
 * Met dit veld plak je de code binnen de app die je al gebruikt, en komt het team
 * bij je bestaande account.
 */
export default function AddTeamByCode() {
  const queryClient = useQueryClient()
  const { loadProfile } = useAuthStore()

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const normalized = normalizeCode(code)
  const canSubmit = normalized.length === 10 && !busy

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true); setError(''); setDone('')

    const result = await linkAccessCode(normalized)
    setBusy(false)

    if (result.error) { setError(result.error); return }

    if (result.team_id) storeActiveTeamId(result.team_id)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user)
    // De teamwisselaar en alles wat aan een team hangt moeten opnieuw laden.
    await queryClient.invalidateQueries()

    setCode('')
    setDone(result.already_linked
      ? 'Je zat al in dit team.'
      : 'Team toegevoegd. Wissel bovenaan tussen je teams.')
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft bg-surface-2 border-border text-text'

  return (
    <div className="rounded-xl p-4 border bg-surface border-border">
      <h2 className="font-semibold text-sm mb-1">Team toevoegen</h2>
      <p className="text-xs text-text-muted mb-3">
        Heb je een persoonlijke link of code voor een ander team gekregen? Vul de code
        hier in, dan komt dat team bij dit account — je houdt dezelfde pincode.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(''); setDone('') }}
          placeholder="ABCDE-FGHJK"
          // Geen autocapitalize/autocorrect: dit is een code, geen woord. De invoer
          // wordt toch genormaliseerd, maar zo ziet de gebruiker meteen wat er staat.
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className={`${inputClass} font-mono tracking-wider`}
        />

        {normalized.length > 0 && normalized.length < 10 && (
          <p className="text-[11px] text-text-subtle">
            Nog {10 - normalized.length} teken{10 - normalized.length === 1 ? '' : 's'} te gaan
            {normalized.length >= 5 && ` — ${formatCode(normalized)}`}
          </p>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle size={12} className="flex-shrink-0" /> {error}
          </p>
        )}
        {done && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <Check size={12} className="flex-shrink-0" /> {done}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text"
        >
          <Plus size={15} />
          {busy ? 'Bezig...' : 'Team toevoegen'}
        </button>
      </form>
    </div>
  )
}
