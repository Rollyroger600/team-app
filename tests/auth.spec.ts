/**
 * Auth tests: login, wrong password, logout.
 * These run without pre-saved auth state.
 */
import { test, expect } from '@playwright/test'

test.describe('Authenticatie', () => {
  test('redirect naar login als niet ingelogd', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/login/, { timeout: 5_000 })
  })

  test('fout melding bij verkeerd wachtwoord', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('jouw@email.nl').fill(process.env.TEST_PLAYER_EMAIL!)
    await page.getByRole('button', { name: 'Doorgaan' }).click()
    await page.getByPlaceholder('Jouw wachtwoord').waitFor({ timeout: 20_000 })
    await page.getByPlaceholder('Jouw wachtwoord').fill('VerkeerdeWachtwoord999!')
    await page.getByRole('button', { name: 'Inloggen' }).click()
    await expect(page.getByText(/onjuist wachtwoord/i)).toBeVisible({ timeout: 8_000 })
  })

  test('onbekend e-mail toont foutmelding', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('jouw@email.nl').fill('bestaat.niet@test.nl')
    await page.getByRole('button', { name: 'Doorgaan' }).click()
    await expect(page.getByText(/niet gevonden|niet bekend/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('inloggen als admin en uitloggen', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('jouw@email.nl').fill(process.env.TEST_ADMIN_EMAIL!)
    await page.getByRole('button', { name: 'Doorgaan' }).click()
    await page.getByPlaceholder('Jouw wachtwoord').waitFor({ timeout: 20_000 })
    await page.getByPlaceholder('Jouw wachtwoord').fill(process.env.TEST_ADMIN_PASSWORD!)
    await page.getByRole('button', { name: 'Inloggen' }).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // Logout via settings page
    await page.goto('/settings')
    await page.getByRole('button', { name: /uitloggen|log.*out/i }).click()
    await expect(page).toHaveURL(/login/, { timeout: 5_000 })
  })
})
