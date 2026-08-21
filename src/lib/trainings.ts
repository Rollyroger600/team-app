import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Trainingen. De gegenereerde rijen ZIJN het schema — er is geen cadans-tabel.
 * Zie de kop van 20260821_trainings.sql voor waarom.
 */

export interface Training {
  id: string
  team_id: string
  training_date: string
  start_time: string
  end_time: string | null
  location: string | null
  notes: string | null
  status: 'scheduled' | 'cancelled'
  generated: boolean
}

export interface TrainingAttendanceRow {
  id: string
  training_id: string
  player_id: string
  status: 'available' | 'unavailable' | 'injured'
  overridden: boolean
  set_by: string | null
}

export const TRAINING_SELECT =
  'id, team_id, training_date, start_time, end_time, location, notes, status, generated'

export const WEEKDAYS = [
  { value: 0, label: 'zondag' },
  { value: 1, label: 'maandag' },
  { value: 2, label: 'dinsdag' },
  { value: 3, label: 'woensdag' },
  { value: 4, label: 'donderdag' },
  { value: 5, label: 'vrijdag' },
  { value: 6, label: 'zaterdag' },
] as const

/** "2026-09-01" → Date op lokale middernacht. Nooit new Date(str) zonder tijd:
 *  die wordt als UTC gelezen en schuift in Nederland een dag terug. */
export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Alle datums tussen `from` en `to` (beide inclusief) die op `weekday` vallen,
 * met `intervalWeeks` ertussen. De eerste voorkomende weekdag vanaf `from` is het
 * anker; verschuif je de begindatum, dan verschuift de hele reeks mee.
 */
export function generateDates(
  from: string,
  to: string,
  weekday: number,
  intervalWeeks: number,
): string[] {
  const start = parseDate(from)
  const end = parseDate(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  // Naar de eerste keer dat `weekday` valt op of na `from`.
  const cursor = new Date(start)
  const shift = (weekday - cursor.getDay() + 7) % 7
  cursor.setDate(cursor.getDate() + shift)

  const step = Math.max(1, intervalWeeks) * 7
  const out: string[] = []
  // Bovengrens tegen een oneindige lus als er ooit iets geks binnenkomt; een
  // seizoen heeft er hooguit een paar honderd.
  while (cursor <= end && out.length < 500) {
    out.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + step)
  }
  return out
}

export function formatTrainingDate(iso: string): string {
  return parseDate(iso).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

/** Trainingen van een team, oudste eerst. Zonder datumfilter: net als bij
 *  match_availability blijft de historie zichtbaar en corrigeerbaar. */
export function useTrainings(teamId: string | undefined, enabled = true) {
  return useQuery<Training[]>({
    queryKey: ['trainings', teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from('trainings')
        .select(TRAINING_SELECT)
        .eq('team_id', teamId!)
        .order('training_date', { ascending: true })
        .order('start_time', { ascending: true })
      return (data as unknown as Training[]) || []
    },
    enabled: !!teamId && enabled,
  })
}

/**
 * Genereert trainingen en is idempotent: tien keer klikken is hetzelfde als één
 * keer. `ON CONFLICT DO NOTHING` op (team_id, training_date, start_time) doet het
 * werk — bewust GEEN delete-then-insert, want dat cascadet de aanwezigheid weg.
 * Dat is exact de bug die de 2e-helft-knop ooit had.
 */
export async function generateTrainings(
  teamId: string,
  opts: { from: string; to: string; weekday: number; intervalWeeks: number; startTime: string; endTime: string | null; location: string | null },
): Promise<{ aangemaakt: number; bestond: number; error?: string }> {
  const dates = generateDates(opts.from, opts.to, opts.weekday, opts.intervalWeeks)
  if (dates.length === 0) return { aangemaakt: 0, bestond: 0, error: 'Geen datums in dit bereik' }

  const rows = dates.map(d => ({
    team_id: teamId,
    training_date: d,
    start_time: opts.startTime,
    end_time: opts.endTime,
    location: opts.location,
    generated: true,
  }))

  const { data, error } = await supabase
    .from('trainings')
    .upsert(rows, { onConflict: 'team_id,training_date,start_time', ignoreDuplicates: true })
    .select('id')

  if (error) return { aangemaakt: 0, bestond: 0, error: error.message }
  const aangemaakt = data?.length ?? 0
  return { aangemaakt, bestond: dates.length - aangemaakt }
}

/**
 * Het venster dat op Home getoond wordt: van vandaag tot en met zondag van deze
 * week.
 *
 * Twee dingen die makkelijk fout gaan. JS telt zondag als dag 0, terwijl een
 * Nederlandse week op maandag begint — vandaar de `(getDay() + 6) % 7`. En de
 * ondergrens is *vandaag*, niet maandag: een training die geweest is hoort van
 * Home af, ook als hij deze week viel. Op maandag valt het venster dus vanzelf
 * samen met de hele nieuwe week.
 */
export function homeWeekRange(now: Date = new Date()): { from: string; to: string } {
  const zondag = new Date(now)
  const dagenTotZondag = 6 - ((now.getDay() + 6) % 7)
  zondag.setDate(zondag.getDate() + dagenTotZondag)
  return { from: toISODate(now), to: toISODate(zondag) }
}

/**
 * Trainingen voor de Home-kaart: deze week, vanaf vandaag, niet afgelast.
 * Aparte query key van useTrainings() zodat Home niet de hele historie ophaalt.
 */
export function useHomeTrainings(teamId: string | undefined, enabled = true) {
  const { from, to } = homeWeekRange()
  return useQuery<Training[]>({
    queryKey: ['homeTrainings', teamId, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from('trainings')
        .select(TRAINING_SELECT)
        .eq('team_id', teamId!)
        .eq('status', 'scheduled')
        .gte('training_date', from)
        .lte('training_date', to)
        .order('training_date', { ascending: true })
        .order('start_time', { ascending: true })
      return (data as unknown as Training[]) || []
    },
    enabled: !!teamId && enabled,
  })
}
