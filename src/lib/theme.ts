import type { Club } from '../types/app'

type ClubWithRegistry = Club & {
  clubs_registry?: {
    primary_color?: string | null
    secondary_color?: string | null
  } | null
}

function getLuminance(hex: string): number {
  if (!hex || hex.length < 7) return 0.5
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function applyClubTheme(club: ClubWithRegistry | null): void {
  if (!club) return
  const root = document.documentElement
  const registry = club.clubs_registry

  const primary = registry?.primary_color || club.primary_color
  const secondary = registry?.secondary_color || club.secondary_color

  if (primary) root.style.setProperty('--color-primary', primary)
  if (secondary) {
    root.style.setProperty('--color-secondary', secondary)
    const textColor = getLuminance(secondary) > 0.35 ? '#0f172a' : '#f1f5f9'
    root.style.setProperty('--color-secondary-text', textColor)
  }
}

export function resetTheme(): void {
  const root = document.documentElement
  root.style.removeProperty('--color-primary')
  root.style.removeProperty('--color-secondary')
  root.style.removeProperty('--color-secondary-text')
}
