/**
 * Theme selection. The palettes themselves live in src/index.css under
 * :root[data-theme="..."]; this module only decides which one is active.
 *
 * The choice is stored in localStorage rather than the database on purpose: it
 * has to be applied before the first paint to avoid a colour flash, which isn't
 * possible if it only arrives after logging in. An inline script in index.html
 * reads the same key and must be kept in sync with STORAGE_KEY / DEFAULT_THEME.
 *
 * This replaced an earlier applyClubTheme() that pushed clubs_registry colours
 * onto documentElement as inline styles. Inline styles beat the attribute
 * selectors above, so it would silently override whatever the player picked —
 * don't reintroduce it. The themes below are the club colours.
 */

export const THEMES = ['clubshirt', 'clubhuis', 'bordeaux'] as const
export type ThemeName = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemeName = 'clubshirt'
const STORAGE_KEY = 'theme'

export interface ThemeOption {
  name: ThemeName
  label: string
  description: string
  /** Swatch colours for the picker: [background, surface, accent]. */
  swatch: [string, string, string]
}

export const THEME_OPTIONS: ThemeOption[] = [
  { name: 'clubshirt', label: 'Clubshirt', description: 'Licht, wit met bordeaux', swatch: ['#f7f5f5', '#ffffff', '#721727'] },
  { name: 'clubhuis',  label: 'Clubhuis',  description: 'Donker met bordeaux',     swatch: ['#14100f', '#1f1a19', '#c43d55'] },
  { name: 'bordeaux',  label: 'Bordeaux',  description: 'Diep clubrood',           swatch: ['#2a0d14', '#3d1520', '#ffffff'] },
]

/** Colour for the browser/PWA chrome. Every theme keeps the bordeaux header. */
const THEME_COLOR = '#721727'

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

export function getTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemeName(stored)) return stored
  } catch {
    // localStorage can throw in private mode — fall through to the default.
  }
  return DEFAULT_THEME
}

export function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR)

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not persisting is survivable; the theme still applies for this session.
  }
}
