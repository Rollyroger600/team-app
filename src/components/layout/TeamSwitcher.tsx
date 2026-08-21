import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Check } from 'lucide-react'
import useAuthStore from '../../stores/useAuthStore'
import useTeamStore from '../../stores/useTeamStore'
import { storeActiveTeamId } from '../../lib/activeTeam'
import { tint } from '../../lib/utils'

/**
 * Teamwisselaar boven de pagina-inhoud.
 *
 * Rendert alleen bij meer dan één actief lidmaatschap, dus voor wie in één team
 * zit verandert er niets aan het scherm.
 *
 * De volgorde bij het wisselen is load-bearing: eerst het team in de store, dan de
 * onthouden keuze in localStorage, dan de querycache legen. Andersom blijft
 * `activeTeam` even op het oude team staan terwijl de nieuwe queries al lopen, en
 * dan haal je de gegevens van team A op onder de naam van team B.
 */
export default function TeamSwitcher() {
  const { memberships } = useAuthStore()
  const { activeTeam, setActiveTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  if (memberships.length < 2) return null

  async function pick(teamId: string) {
    setOpen(false)
    if (teamId === activeTeam?.id) return

    const m = memberships.find(x => x.team_id === teamId)
    if (!m?.teams) return

    storeActiveTeamId(teamId)
    await setActiveTeam(
      m.teams as Parameters<typeof setActiveTeam>[0],
      m.teams.clubs as Parameters<typeof setActiveTeam>[1],
    )
    // Bewust invalidateQueries en NIET clear(). De query keys bevatten het team-id,
    // dus de schermen halen na de wissel sowieso onder een nieuwe key op; clear()
    // haalt de cache onderuit terwijl die queries al lopen en laat het scherm dan
    // eeuwig op de laadspinner staan. Dat gebeurde hier echt.
    await queryClient.invalidateQueries()
  }

  return (
    <div className="relative max-w-lg mx-auto px-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-secondary-soft"
        style={{ backgroundColor: tint('--color-secondary', 10) }}
      >
        {activeTeam?.name ?? 'Kies een team'}
        <ChevronDown size={13} />
      </button>

      {open && (
        <>
          {/* Klik ernaast sluit het lijstje. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-4 mt-1 z-20 min-w-[12rem] rounded-xl border overflow-hidden bg-surface border-border shadow-lg">
            {memberships.map(m => (
              <li key={m.team_id}>
                <button
                  type="button"
                  onClick={() => pick(m.team_id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="truncate">
                    {m.teams?.name ?? 'Team'}
                    {m.teams?.clubs?.name && (
                      <span className="block text-[11px] text-text-subtle truncate">
                        {m.teams.clubs.name}
                      </span>
                    )}
                  </span>
                  {m.team_id === activeTeam?.id && (
                    <Check size={14} className="flex-shrink-0 text-secondary-soft" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
