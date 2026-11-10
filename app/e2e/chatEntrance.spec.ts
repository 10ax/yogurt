import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const before = process.env.YOGURT_UI_REVIEW === 'before'

test('Ask starters stay still and disappear while typing', async ({}, info) => {
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: {
    ...process.env, YOGURT_FAKE: '1', YOGURT_USER_DATA: mkdtempSync(join(tmpdir(), 'yogurt-chat-entrance-')),
  } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('home')).toBeVisible()
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' })
      await page.getByTestId('nav-chat').click()
      const starters = page.getByTestId('chat-starter')
      await expect(starters).toHaveCount(3)
      if (!before) {
        // The new top composer is static; suggestions yield to typing.
        expect(await starters.evaluateAll(els => els.every(el => el.getAnimations().length === 0))).toBe(true)
        await page.getByTestId('chat-page-input').fill('What did we decide?')
        await expect(starters).toHaveCount(0)
        await page.getByTestId('chat-page-input').fill('')
        await expect(starters).toHaveCount(3)
      }
      await page.screenshot({ path: info.outputPath(`chat-${before ? 'before' : 'after'}-${colorScheme}.png`) })
      await page.getByTestId('nav-home').click()
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('nav-chat').click()
    await expect(page.getByTestId('chat-starter')).toHaveCount(3)
    expect(await page.getByTestId('chat-starter').evaluateAll(els => els.every(el => el.getAnimations().length === 0 && getComputedStyle(el).opacity === '1' && getComputedStyle(el).transform === 'none'))).toBe(true)
  } finally { await app.close() }
})
