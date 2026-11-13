import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// a version "downloaded" at launch; the corner waits AFTER_MS (a day in a real install) before offering Restart
const AFTER_MS = 1500
async function launch() {
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: {
    ...process.env, YOGURT_FAKE: '1', YOGURT_USER_DATA: mkdtempSync(join(tmpdir(), 'yogurt-update-')),
    YOGURT_FAKE_UPDATE: '9.9.9', YOGURT_FAKE_UPDATE_AFTER_MS: String(AFTER_MS),
  } })
  const page = await app.firstWindow()
  await expect(page.getByTestId('home')).toBeVisible()
  return { app, page }
}
const restarts = (app: Awaited<ReturnType<typeof launch>>['app']) =>
  app.evaluate(() => (globalThis as any).__fake__.main().updateRestarts as number)

test('a downloaded version waits, then the corner offers Restart Yogurt, which restarts', async () => {
  const { app, page } = await launch()
  try {
    const toast = page.getByTestId('update-toast')
    await expect(toast).toHaveCount(0)
    await expect(toast).toContainText('A new version of Yogurt is ready', { timeout: 10_000 })
    await toast.getByTestId('update-restart').click()
    await expect.poll(() => restarts(app)).toBe(1)
    await expect(toast).toHaveCount(0)
  } finally { await app.close() }
})

test('closing the offer puts it off, and it comes back later', async () => {
  const { app, page } = await launch()
  try {
    const toast = page.getByTestId('update-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await toast.locator('.app-toast-close').click()
    await expect(toast).toHaveCount(0)
    await page.waitForTimeout(AFTER_MS / 2)
    await expect(toast).toHaveCount(0)
    await expect(toast).toBeVisible({ timeout: 10_000 })
    expect(await restarts(app)).toBe(0)
  } finally { await app.close() }
})

test('never offered while recording', async () => {
  const { app, page } = await launch()
  try {
    await page.evaluate(() => window.yogurt.meetings.start(null))
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    await page.waitForTimeout(AFTER_MS * 3)
    await expect(page.getByTestId('update-toast')).toHaveCount(0)
    await page.getByTestId('note-stop').click()
    await expect(page.getByTestId('update-toast')).toBeVisible({ timeout: 10_000 })
  } finally { await app.close() }
})

test('an offer already in the corner goes away the moment a recording starts', async () => {
  const { app, page } = await launch()
  try {
    const toast = page.getByTestId('update-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await page.evaluate(() => window.yogurt.meetings.start(null))
    await expect(toast).toHaveCount(0, { timeout: 1000 })
  } finally { await app.close() }
})
