import { format, subMinutes, setMinutes, getMinutes, isValid } from 'date-fns'
import type { Match } from '../types/app'
import type { TeamSettings } from '../types/app'

export interface GatheringInfo {
  time: string | null
  label: string
  isNtb?: boolean
  isOverride?: boolean
}

/**
 * Calculate gathering time for a match
 * @param matchTime - "HH:mm" format
 * @param travelMinutes - travel duration in minutes (null = home game)
 * @param settings - { gathering_lead_time, travel_buffer_minutes }
 * @returns "HH:mm" format or null if matchTime is null
 */
export function calculateGatheringTime(
  matchTime: string | null,
  travelMinutes: number | null,
  settings: Partial<TeamSettings>
): string | null {
  if (!matchTime) return null

  const { gathering_lead_time = 30, travel_buffer_minutes = 10 } = settings

  // Parse time as a Date object (use arbitrary date)
  const [hours, minutes] = matchTime.split(':').map(Number)
  let gatherTime = new Date(2000, 0, 1, hours, minutes, 0)

  if (!isValid(gatherTime)) return null

  // Subtract gathering lead time
  gatherTime = subMinutes(gatherTime, gathering_lead_time)

  // For away games: subtract travel time + buffer
  if (travelMinutes != null && travelMinutes > 0) {
    gatherTime = subMinutes(gatherTime, travelMinutes + travel_buffer_minutes)
  }

  // Round DOWN to nearest 15 minutes (always give extra time)
  const mins = getMinutes(gatherTime)
  const roundedDown = Math.floor(mins / 15) * 15
  gatherTime = setMinutes(gatherTime, roundedDown)

  return format(gatherTime, 'HH:mm')
}

/**
 * Format gathering time display string
 */
export function formatGatheringDisplay(
  match: Match | null,
  teamSettings: Partial<TeamSettings>
): GatheringInfo | null {
  if (!match) return null

  const { match_time, is_home, gathering_time_override, travel_duration_minutes, opponent } = match

  if (gathering_time_override) {
    return {
      time: gathering_time_override,
      label: is_home ? 'verzamelen op de club' : `verzamelen (${travel_duration_minutes} min rijden)`,
      isOverride: true
    }
  }

  if (!match_time) {
    return { time: null, label: 'Tijd NTB', isNtb: true }
  }

  const gatherTime = calculateGatheringTime(
    match_time,
    is_home ? null : travel_duration_minutes,
    teamSettings
  )

  return {
    time: gatherTime,
    label: is_home ? 'verzamelen op de club' : `verzamelen (${travel_duration_minutes || '?'} min rijden)`,
    isNtb: false
  }
}
