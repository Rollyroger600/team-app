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

export function buildShareText(match: Match, gatheringInfo: GatheringInfo | null): string {
  const dateStr = formatDate(match.match_date)
  const timeStr = formatTime(match.match_time)
  const location = match.is_home ? 'Thuis' : `Uit bij ${match.opponent}`
  const gatherText = gatheringInfo?.time
    ? `Verzamelen: ${gatheringInfo.time} (${gatheringInfo.label})`
    : 'Tijd nog niet bekend'

  return `*Hockey ${dateStr}*\n${location} vs ${match.opponent}\nAanvang: ${timeStr}\n${gatherText}\n\nGeef je beschikbaarheid op in de app!`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
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
