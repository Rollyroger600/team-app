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
  /**
   * Label voor een training in plaats van een wedstrijd. "Beschikbaar" slaat op
   * een selectie; bij een training gaat het over komen of niet. Alleen gezet waar
   * het echt anders leest -- de rest valt terug op `label`.
   */
  attendanceLabel?: string
}

export const STATUSES: StatusDef[] = [
  {
    status: 'available',
    label: 'Beschikbaar',
    shortLabel: 'Beschikbaar',
    attendanceLabel: 'Aanwezig',
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
    attendanceLabel: 'Afwezig',
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

/** The statuses a player may set for themselves. Geldt ook voor trainingen: die
 *  kennen geen 'rostered_off' (uitgeroosterd worden slaat op een wedstrijd-
 *  selectie), en dat is precies wat adminOnly hier al wegfiltert. */
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

/** Waar een scherm over wedstrijden én trainingen gaat. */
export type EventKind = 'match' | 'training'

/**
 * Label voor een status, afhankelijk van waar het over gaat. Bewust hier en niet
 * als tweede STATUSES-array: iconen, kleuren en matrixmarkers zijn identiek, en
 * die twee keer onderhouden is precies wat deze module ooit kwam oplossen.
 */
export function statusLabelFor(
  status: string | null | undefined,
  kind: EventKind,
  fallback = 'Onbekend',
): string {
  const def = statusDef(status)
  if (!def) return fallback
  return kind === 'training' ? (def.attendanceLabel ?? def.label) : def.label
}
