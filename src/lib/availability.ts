import { CheckCircle, XCircle, Bandage, UserMinus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AvailabilityStatus } from '../types/app'

/**
 * Single source of truth for the availability statuses: label, icon, colours and
 * the marker used in the attendance matrix.
 *
 * These used to be redefined in six places (Dashboard, More, MatchDetail,
 * Matches, TeamAvailabilityList and AdminAttendance, plus colour helpers in
 * utils.ts), which made adding a status a six-way edit. Render every status
 * through this module instead.
 *
 * `rostered_off` is admin-only. Hiding the button is not enough on its own —
 * RLS lets a player write to their own row — so a DB trigger
 * (`enforce_admin_only_rostered_off`) rejects it for non-admins. Keep both.
 */
export interface StatusDef {
  status: AvailabilityStatus
  /** UI label. Dutch, deliberately chosen — don't rephrase. */
  label: string
  /** Short label for tight spots (the quick-set row on Wedstrijden). */
  shortLabel: string
  icon: LucideIcon
  /** Dot in the player list. */
  dot: string
  /** Classes for the button/pill when this status is the active one. */
  active: string
  /** Text colour on its own (counts, inline labels). */
  text: string
  /** Marker in the attendance matrix. */
  cell: string
  /** Only a team_admin / platform_admin may set this. */
  adminOnly?: boolean
}

export const STATUSES: StatusDef[] = [
  {
    status: 'available',
    label: 'Beschikbaar',
    shortLabel: 'Beschikbaar',
    icon: CheckCircle,
    dot: 'bg-available',
    active: 'bg-available/20 border-available/50 text-success',
    text: 'text-success',
    cell: '1',
  },
  {
    status: 'unavailable',
    label: 'Niet beschikbaar',
    shortLabel: 'Niet',
    icon: XCircle,
    dot: 'bg-unavailable',
    active: 'bg-unavailable/20 border-unavailable/50 text-danger',
    text: 'text-danger',
    cell: '0',
  },
  {
    status: 'injured',
    label: 'Geblesseerd',
    shortLabel: 'Geblesseerd',
    icon: Bandage,
    dot: 'bg-maybe',
    // Uses --color-maybe, not the brand colour: a status must stay
    // distinguishable from buttons and navigation in every theme.
    active: 'bg-maybe/20 border-maybe/50 text-maybe',
    text: 'text-maybe',
    cell: 'B',
  },
  {
    status: 'rostered_off',
    label: 'Uitgeroosterd',
    shortLabel: 'Uitgeroosterd',
    icon: UserMinus,
    dot: 'bg-rostered-off',
    active: 'bg-rostered-off/20 border-rostered-off/50 text-rostered-off',
    text: 'text-rostered-off',
    cell: 'U',
    adminOnly: true,
  },
]

/** The statuses a player may set for themselves. */
export const PLAYER_STATUSES: StatusDef[] = STATUSES.filter(s => !s.adminOnly)

export function statusDef(status: string | null | undefined): StatusDef | undefined {
  if (!status) return undefined
  return STATUSES.find(s => s.status === status)
}

/** Dot classes for a player row, falling back to "no answer yet". */
export function statusDot(status: string | null | undefined): string {
  return statusDef(status)?.dot || 'bg-surface-4'
}

/** Text colour for a status, falling back to muted. */
export function statusText(status: string | null | undefined): string {
  return statusDef(status)?.text || 'text-text-muted'
}

/** Label for a status, falling back to a caller-supplied default. */
export function statusLabel(status: string | null | undefined, fallback = 'Onbekend'): string {
  return statusDef(status)?.label || fallback
}
