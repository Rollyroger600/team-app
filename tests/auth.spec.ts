/**
 * Auth tests: PIN login flow, RBAC nav/route gating.
 * Runs unauthenticated, against the dedicated qa-club/qa-team fixture
 * data (see .env.test) — never the real pilot roster.
 */
import { test, expect, type Page } from '@playwright/test'
import { createDisposablePlayer } from './helpers'

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
}

// For PINs shorter than 6 digits, auto-submit never fires — click the
// visible submit button explicitly ("Inloggen" / "Doorgaan" / "Pincode
// instellen"). Safe to call after a 6-digit PIN too: if it already
// auto-submitted and navigated away, the button is simply gone.
async function submitPinIfNeeded(page: Page) {
  const submit = page.getByRole('button', { name: /^(Inloggen|Doorgaan|Pincode instellen)$/ })
  if (await submit.isVisible({ timeout: 500 }).catch(() => false)) {
    await submit.click()
  }
}

async function goToNamePicker(page: Page) {
  await page.goto(`/login?club=${process.env.QA_CLUB_SLUG}&team=${process.env.QA_TEAM_SLUG}`)
  await expect(page.getByText('Wie ben jij?')).toBeVisible({ timeout: 10_000 })
}

async function logout(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: /uitloggen/i }).click()
  await expect(page).toHaveURL(/login/, { timeout: 5_000 })
}

test.describe('Authenticatie', () => {
  test('redirect naar login als niet ingelogd', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/login/, { timeout: 5_000 })
  })

  test('team -> naam -> PIN happy path', async ({ page }) => {
    await goToNamePicker(page)
    await page.getByRole('button', { name: process.env.QA_PLAYER_NAME!, exact: true }).click()
    await enterPin(page, process.env.QA_PLAYER_PIN!)
    await submitPinIfNeeded(page)
    await expect(page).toHaveURL('/', { timeout: 20_000 })
  })

  test('foutieve PIN toont foutmelding', async ({ page }) => {
    await goToNamePicker(page)
    await page.getByRole('button', { name: process.env.QA_PLAYER_NAME!, exact: true }).click()
    await enterPin(page, '000000')
    await expect(page.getByText('Onjuiste PIN')).toBeVisible({ timeout: 5_000 })
  })

  test('eerste keer pincode instellen, incl. mismatch', async ({ page, request }) => {
    const { display_name } = await createDisposablePlayer(request, 'QA Setup')
    await goToNamePicker(page)
    await page.getByRole('button', { name: display_name, exact: true }).click()
    await expect(page.getByText('Kies een pincode')).toBeVisible()

    // Confirm with a different PIN -> mismatch error, stays on setup flow
    // (6-digit PINs auto-submit on the last digit, no extra button click needed)
    await enterPin(page, '111111')
    await expect(page.getByText('Bevestig je pincode')).toBeVisible()
    await enterPin(page, '222222')
    await expect(page.getByText(/PINs komen niet overeen/i)).toBeVisible({ timeout: 5_000 })

    // Retry with matching PIN -> success
    await enterPin(page, '111111')
    await expect(page).toHaveURL('/', { timeout: 20_000 })
  })

  test('account wordt geblokkeerd na 5 foutieve pogingen', async ({ page, request }) => {
    const { display_name } = await createDisposablePlayer(request, 'QA Lockout')

    // Set a known PIN via the UI first so has_set_pin=true and lockout logic applies
    await goToNamePicker(page)
    await page.getByRole('button', { name: display_name, exact: true }).click()
    await enterPin(page, '999999')
    await expect(page.getByText('Bevestig je pincode')).toBeVisible()
    await enterPin(page, '999999')
    await expect(page).toHaveURL('/', { timeout: 20_000 })
    await logout(page)

    await goToNamePicker(page)
    await page.getByRole('button', { name: display_name, exact: true }).click()
    for (let i = 0; i < 4; i++) {
      await enterPin(page, '123123') // wrong PIN
      await expect(page.getByText('Onjuiste PIN')).toBeVisible({ timeout: 5_000 })
    }
    await enterPin(page, '123123') // 5th wrong attempt -> lockout
    await expect(page.getByText(/geblokkeerd voor 15 minuten/i)).toBeVisible({ timeout: 5_000 })
  })

  test('admin-navigatie zichtbaar voor team_admin, verborgen + geblokkeerd voor speler', async ({ page }) => {
    // team_admin: admin link visible on /more, /admin loads
    await goToNamePicker(page)
    await page.getByRole('button', { name: process.env.QA_TEAM_ADMIN_NAME!, exact: true }).click()
    await enterPin(page, process.env.QA_TEAM_ADMIN_PIN!)
    await submitPinIfNeeded(page)
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    await page.goto('/more')
    await expect(page.getByRole('link', { name: /admin/i })).toBeVisible({ timeout: 5_000 })
    await page.goto('/admin')
    await expect(page).toHaveURL('/admin', { timeout: 5_000 })
    await logout(page)

    // plain player: admin link hidden, /admin redirects away
    await goToNamePicker(page)
    await page.getByRole('button', { name: process.env.QA_PLAYER_NAME!, exact: true }).click()
    await enterPin(page, process.env.QA_PLAYER_PIN!)
    await submitPinIfNeeded(page)
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    await page.goto('/more')
    await expect(page.getByRole('link', { name: /admin/i })).not.toBeVisible()
    await page.goto('/admin')
    await expect(page).not.toHaveURL('/admin', { timeout: 5_000 })
  })

  test('uitloggen', async ({ page }) => {
    await goToNamePicker(page)
    await page.getByRole('button', { name: process.env.QA_PLAYER_NAME!, exact: true }).click()
    await enterPin(page, process.env.QA_PLAYER_PIN!)
    await submitPinIfNeeded(page)
    await expect(page).toHaveURL('/', { timeout: 20_000 })
    await logout(page)
  })
})
