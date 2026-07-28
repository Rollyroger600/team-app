import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { Match } from '../types/app'

type GatheringInfo = {
  time: string | null
  label: string
  isNtb?: boolean
  isOverride?: boolean
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Datum onbekend'
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  if (isToday(date)) return 'Vandaag'
  if (isTomorrow(date)) return 'Morgen'
  return format(date, 'EEE d MMM', { locale: nl })
}

export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Datum onbekend'
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  return format(date, 'EEEE d MMMM yyyy', { locale: nl })
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return 'NTB'
  return timeStr.substring(0, 5)
}

export function buildWhatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export interface ShareAvailability {
  available: string[]
  unavailable: string[]
  injured: string[]
  unknown: string[]
  /** Normally empty: the message goes out on Monday, long before a squad is picked. */
  rosteredOff: string[]
}

function namesWithTotal(names: string[]): string {
  if (names.length === 0) return 'niemand (0)'
  return `${names.join(', ')} (${names.length})`
}

/** `opponentLabel` lets the caller pass the short display name (see useOpponentName). */
export function buildShareText(match: Match, gatheringInfo: GatheringInfo | null, availability: ShareAvailability, opponentLabel?: string): string {
  const dayDate = capitalizeFirst(format(parseISO(match.match_date), 'EEEE d MMMM', { locale: nl }))
  const timeStr = formatTime(match.match_time)
  const gatherStr = gatheringInfo?.time || 'nog niet bekend'

  // Uitgeroosterd has no fixed line — it's normally empty at share time — but it
  // appears when it does apply, so nobody silently drops out of the message.
  const rosteredOffLine = availability.rosteredOff.length > 0
    ? `Uitgeroosterd: ${namesWithTotal(availability.rosteredOff)}\n`
    : ''

  return `${dayDate} spelen we tegen ${opponentLabel || match.opponent}. We spelen om ${timeStr} en verzamelen om ${gatherStr} op de club.\n\n`
    + `De volgende spelers staan op aanwezig: ${namesWithTotal(availability.available)}\n`
    + `Afwezig: ${namesWithTotal(availability.unavailable)}\n`
    + `Geblesseerd: ${namesWithTotal(availability.injured)}\n`
    + rosteredOffLine
    + `Onbekend: ${namesWithTotal(availability.unknown)}\n\n`
    + `Mocht bovenstaande aanwezigheid niet kloppen, graag aanpassen in de app én Marlof een bericht sturen.`
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * A theme colour at partial opacity, for inline `style` props where Tailwind's
 * `/20` opacity modifier isn't available. Pass a `--color-*` variable name.
 */
export function tint(cssVar: string, percent: number): string {
  return `color-mix(in srgb, var(${cssVar}) ${percent}%, transparent)`
}

/** Prefer a league team's admin-set short_name over its (often long, registry-imported) team_name. */
export function leagueTeamDisplayName(team: { team_name: string; short_name?: string | null } | null | undefined): string {
  if (!team) return '?'
  return team.short_name || team.team_name
}

// getAvailabilityColor/getAvailabilityBg lived here and knew the statuses by
// name. They had no callers left and would have been a fourth place to update
// per status — see statusText()/statusDot() in src/lib/availability.ts instead.
