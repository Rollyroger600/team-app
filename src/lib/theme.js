export function applyClubTheme(club) {
  if (!club) return
  const root = document.documentElement
  if (club.primary_color) root.style.setProperty('--color-primary', club.primary_color)
  if (club.secondary_color) root.style.setProperty('--color-secondary', club.secondary_color)
}

export function resetTheme() {
  const root = document.documentElement
  root.style.removeProperty('--color-primary')
  root.style.removeProperty('--color-secondary')
}
