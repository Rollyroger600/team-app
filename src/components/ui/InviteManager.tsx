import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Share2, Link2, RefreshCw, Trash2, UserPlus, Check, AlertCircle, Clock } from 'lucide-react'
import {
  useAccessCodes,
  createInvite,
  revokeInvite,
  regenerateCode,
  shareInvite,
  isPending,
  isExpired,
  type AccessCode,
} from '../../lib/invites'
import { formatCode } from '../../lib/accessCodes'
import { tint } from '../../lib/utils'

/**
 * Uitnodigingen en persoonlijke links, in Admin → Spelers.
 *
 * Twee groepen op één scherm: openstaande uitnodigingen (nog niet verzilverd) en
 * de links van mensen die er al in zitten. Die tweede groep is er omdat de vraag
 * in de praktijk "ik ben mijn link kwijt" is, niet "nodig mij uit".
 */

interface InviteManagerProps {
  teamId: string
  teamName: string | null
  currentUserId: string | null
}

const ROLE_LABELS: Record<AccessCode['role'], string> = {
  player: 'Speler',
  team_admin: 'Beheerder',
  team_owner: 'Hoofdbeheerder',
}

export default function InviteManager({ teamId, teamName, currentUserId }: InviteManagerProps) {
  const queryClient = useQueryClient()
  const { data: codes = [], isLoading } = useAccessCodes(teamId)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [jersey, setJersey] = useState('')
  const [role, setRole] = useState<AccessCode['role']>('player')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const pending = codes.filter(isPending)
  const active = codes.filter(c => c.activated_at)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['accessCodes', teamId] })
  }

  function flash(id: string, message: string) {
    setFeedback(f => ({ ...f, [id]: message }))
    setTimeout(() => setFeedback(f => {
      const next = { ...f }
      delete next[id]
      return next
    }), 2500)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError('')
    const { invite, error: err } = await createInvite(
      teamId,
      {
        display_name: name.trim(),
        jersey_number: jersey ? parseInt(jersey, 10) : null,
        role,
      },
      currentUserId,
    )
    setBusy(false)
    if (err || !invite) {
      setError(err ?? 'Kon de uitnodiging niet aanmaken')
      return
    }
    setName(''); setJersey(''); setRole('player'); setShowForm(false)
    refresh()
    flash(invite.id, 'Uitnodiging aangemaakt')
  }

  async function handleShare(c: AccessCode) {
    const result = await shareInvite(c, teamName)
    if (result === 'gedeeld') flash(c.id, 'Gedeeld')
    else if (result === 'gekopieerd') flash(c.id, 'Link gekopieerd')
    else flash(c.id, 'Delen niet gelukt')
  }

  async function handleRegenerate(c: AccessCode) {
    if (!window.confirm(`Nieuwe link voor ${c.display_name}? De oude link werkt daarna niet meer.`)) return
    const { error: err } = await regenerateCode(c.id)
    if (err) { flash(c.id, 'Mislukt'); return }
    refresh()
    flash(c.id, 'Nieuwe link gemaakt')
  }

  async function handleRevoke(c: AccessCode) {
    if (!window.confirm(`Uitnodiging voor ${c.display_name} intrekken? De link werkt daarna niet meer.`)) return
    const { error: err } = await revokeInvite(c.id)
    if (err) { flash(c.id, 'Mislukt'); return }
    refresh()
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft bg-surface-2 border-border text-text'

  function Row({ c, showRevoke }: { c: AccessCode; showRevoke: boolean }) {
    const expired = isExpired(c)
    return (
      <div className="flex items-center gap-2 py-2.5 border-t border-border first:border-t-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {c.display_name}
            {c.jersey_number != null && (
              <span className="text-text-subtle font-normal"> · #{c.jersey_number}</span>
            )}
            {c.role !== 'player' && (
              <span className="text-secondary-soft font-normal"> · {ROLE_LABELS[c.role]}</span>
            )}
          </p>
          <p className="text-[11px] font-mono text-text-subtle">
            {formatCode(c.code)}
            {expired && <span className="ml-1 text-danger font-sans">· verlopen</span>}
            {feedback[c.id] && <span className="ml-1 text-success font-sans">· {feedback[c.id]}</span>}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleShare(c)}
          aria-label={`Link van ${c.display_name} delen`}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-secondary-text bg-secondary"
        >
          <Share2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => handleRegenerate(c)}
          aria-label={`Nieuwe link voor ${c.display_name}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-text-muted hover:bg-surface-2"
        >
          <RefreshCw size={14} />
        </button>
        {showRevoke && (
          <button
            type="button"
            onClick={() => handleRevoke(c)}
            aria-label={`Uitnodiging voor ${c.display_name} intrekken`}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-danger hover:bg-unavailable/10"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4 border space-y-4 bg-surface border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-secondary-soft" />
          <h2 className="font-semibold text-sm">Persoonlijke links</h2>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(v => !v); setError('') }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-secondary-text"
        >
          <UserPlus size={13} />
          Uitnodigen
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-text-subtle">
        Iedereen logt in via zijn eigen link. De link zegt wie je bent; je pincode blijft
        het geheim. Kwijt of in de verkeerde groepsapp beland? Maak een nieuwe — de oude
        werkt dan niet meer.
      </p>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-2.5 rounded-lg p-3" style={{ backgroundColor: tint('--color-secondary', 6) }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam (zoals in de app getoond)"
            className={inputClass}
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={jersey}
              onChange={(e) => setJersey(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Rugnr."
              className={`${inputClass} w-24`}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AccessCode['role'])}
              className={inputClass}
            >
              <option value="player">Speler</option>
              <option value="team_admin">Beheerder</option>
              <option value="team_owner">Hoofdbeheerder</option>
            </select>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <AlertCircle size={12} /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 bg-secondary text-secondary-text"
          >
            {busy ? 'Bezig...' : 'Uitnodiging aanmaken'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-xs text-text-muted">Laden...</p>}

      {!isLoading && pending.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted mb-1">
            <Clock size={12} /> Nog niet gebruikt ({pending.length})
          </p>
          {pending.map(c => <Row key={c.id} c={c} showRevoke />)}
        </div>
      )}

      {!isLoading && active.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted mb-1">
            <Check size={12} /> In gebruik ({active.length})
          </p>
          {active.map(c => <Row key={c.id} c={c} showRevoke={false} />)}
        </div>
      )}

      {!isLoading && codes.length === 0 && (
        <p className="text-xs text-text-muted">Nog geen links. Nodig iemand uit om te beginnen.</p>
      )}
    </div>
  )
}
