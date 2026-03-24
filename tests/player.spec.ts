/**
 * Player tests: alle flows voor een gewone speler.
 * Draait met opgeslagen auth state (playwright.player@test.nl).
 */
import { test, expect } from '@playwright/test'

test.describe('Overzicht (dashboard)', () => {
  test('dashboard laadt zonder fouten', async ({ page }) => {
    await page.goto('/')
    // Spinner should disappear
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 })
    // No error messages
    await expect(page.getByText(/error|fout|something went wrong/i)).not.toBeVisible()
  })

  test('volgende wedstrijd zichtbaar op dashboard', async ({ page }) => {
    await page.goto('/')
    // Should show opponent name or "geen wedstrijd"
    await expect(
      page.getByText(/Huizer|geen.*wedstrijd|volgende/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('beschikbaarheid beschikbaar instellen', async ({ page }) => {
    await page.goto('/')
    // Look for availability buttons (beschikbaar/niet/misschien)
    const beschikbaarBtn = page.getByRole('button', { name: /beschikbaar/i }).first()
    if (await beschikbaarBtn.isVisible()) {
      await beschikbaarBtn.click()
      // Button should appear active/selected
      await expect(beschikbaarBtn).toHaveAttribute('style', /color|background/, { timeout: 3_000 })
    }
  })

  test('beschikbaarheid niet beschikbaar instellen', async ({ page }) => {
    await page.goto('/')
    const nietBtn = page.getByRole('button', { name: /niet beschikbaar|niet/i }).first()
    if (await nietBtn.isVisible()) {
      await nietBtn.click()
      await expect(page.getByText(/niet beschikbaar|afwezig/i).first()).toBeVisible({ timeout: 3_000 })
    }
  })
})

test.describe('Wedstrijden tabs', () => {
  test('Programma tab laadt', async ({ page }) => {
    await page.goto('/matches')
    // Wait for page to load
    await expect(page.getByText(/programma|upcoming|wedstrijd/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('Programma toont aankomende wedstrijden', async ({ page }) => {
    await page.goto('/matches')
    // Click Programma tab
    await page.getByRole('button', { name: /programma/i }).click()
    // Should show at least one match
    await expect(page.getByText(/Huizer|Gooische|MMHC|Amsterdamsche/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('Uitslagen tab laadt gespeelde wedstrijden', async ({ page }) => {
    await page.goto('/matches')
    await page.getByRole('button', { name: /uitslagen/i }).click()
    // Should show past opponents
    await expect(page.getByText(/Bloemendaal|Rotterdam|HDM|Kampong/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('Stand sectie zichtbaar in Overzicht', async ({ page }) => {
    await page.goto('/matches')
    // Stand is a MiniStandings section within the content, not a tab
    await expect(page.getByText('Stand').first()).toBeVisible({ timeout: 8_000 })
  })

  test('beschikbaarheid uitklappen onder wedstrijd in Programma', async ({ page }) => {
    await page.goto('/matches')
    await page.getByRole('button', { name: /programma/i }).click()
    await page.waitForTimeout(500)

    // Availability section is collapsed — find and click the toggle to open it
    // The toggle button shows "Jouw opgave" or status label + player count
    const availToggle = page.locator('button').filter({ hasText: /opgave|beschikbaar|misschien|niet/i }).first()
    if (await availToggle.isVisible({ timeout: 5_000 })) {
      await availToggle.click()
      // After expanding: buttons "Beschikbaar", "Niet", "Misschien" should appear
      await expect(page.getByRole('button', { name: 'Beschikbaar' }).first()).toBeVisible({ timeout: 3_000 })
    }
  })
})

test.describe('Statistieken', () => {
  test('stats pagina laadt', async ({ page }) => {
    await page.goto('/stats')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/error|fout/i)).not.toBeVisible()
  })

  test('spelers staan in stats', async ({ page }) => {
    await page.goto('/stats')
    await expect(page.getByText(/arjen|bas|daan|martijn|rogier/i).first()).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Instellingen', () => {
  test('profiel pagina laadt', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/playwright speler|profiel|settings/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('Admin menu NIET zichtbaar voor gewone speler', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /admin/i })).not.toBeVisible()
  })

  test('Admin route geblokkeerd voor gewone speler', async ({ page }) => {
    await page.goto('/admin')
    // Should redirect away from admin
    await expect(page).not.toHaveURL('/admin', { timeout: 3_000 })
  })
})
