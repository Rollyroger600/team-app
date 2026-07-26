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
  unknownOrMaybe: string[]
}

function namesWithTotal(names: string[]): string {
  if (names.length === 0) return 'niemand (0)'
  return `${names.join(', ')} (${names.length})`
}

export function buildShareText(match: Match, gatheringInfo: GatheringInfo | null, availability: ShareAvailability): string {
  const dayDate = capitalizeFirst(format(parseISO(match.match_date), 'EEEE d MMMM', { locale: nl }))
  const timeStr = formatTime(match.match_time)
  const gatherStr = gatheringInfo?.time || 'nog niet bekend'

  return `${dayDate} spelen we tegen ${match.opponent}. We spelen om ${timeStr} en verzamelen om ${gatherStr} op de club.\n\n`
    + `De volgende spelers staan op aanwezig: ${namesWithTotal(availability.available)}\n`
    + `Afwezig: ${namesWithTotal(availability.unavailable)}\n`
    + `Onbekend of misschien: ${namesWithTotal(availability.unknownOrMaybe)}\n\n`
    + `Mocht bovenstaande aanwezigheid niet kloppen, graag aanpassen in de app én Marlof een bericht sturen.`
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Prefer a league team's admin-set short_name over its (often long, registry-imported) team_name. */
export function leagueTeamDisplayName(team: { team_name: string; short_name?: string | null } | null | undefined): string {
  if (!team) return '?'
  return team.short_name || team.team_name
}

export function getAvailabilityColor(status: string | null | undefined): string {
  switch (status) {
    case 'available': return 'text-green-400'
    case 'unavailable': return 'text-red-400'
    case 'maybe': return 'text-amber-400'
    default: return 'text-slate-400'
  }
}

export function getAvailabilityBg(status: string | null | undefined): string {
  switch (status) {
    case 'available': return 'bg-green-500/20 border-green-500/40'
    case 'unavailable': return 'bg-red-500/20 border-red-500/40'
    case 'maybe': return 'bg-amber-500/20 border-amber-500/40'
    default: return 'bg-slate-500/20 border-slate-500/40'
  }
}
