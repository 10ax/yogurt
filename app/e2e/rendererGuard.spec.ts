import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectNoteVersion } from './noteVersion'

for (const theme of ['light', 'dark'] as const) test(`a render failure preserves edits, logs diagnostics, reloads and quits without a false save warning in ${theme}`, async () => {
  const userData = mkdtempSync(join(tmpdir(), 'yogurt-renderer-guard-'))
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: { ...process.env, YOGURT_FAKE: '1', YOGURT_USER_DATA: userData } })
  let closed = false
  app.on('close', () => { closed = true })
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('home')).toBeVisible()
    await page.evaluate(theme => window.yogurt.settings.setTheme(theme), theme)
    await app.evaluate(() => (globalThis as unknown as { __fake__: { manyMeetings(o: { n: number; clean: boolean }): void } }).__fake__.manyMeetings({ n: 1, clean: true }))
    await page.reload()
    await page.getByTestId('past-note').click()
    await selectNoteVersion(page, 'mine')
    const draft = 'Private draft sentinel for recovery'
    await page.getByTestId('note-mine').fill(draft)
    // No debounce wait: the error unmounts the editor while its latest edit is pending.
    await page.evaluate(() => window.dispatchEvent(new Event('yogurt:renderer-fail')))
    await expect(page.getByTestId('renderer-recovery')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeFocused()
    expect(await page.getByTestId('renderer-recovery').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    const log = join(userData, 'logs/main.log')
    const logged = () => existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(line => line.includes('renderer error')) : []
    await expect.poll(() => logged().join('\n')).toContain('Renderer recovery test')
    const line = logged().find(line => line.includes('Renderer recovery test'))!
    const diagnostic = JSON.parse(line.slice(line.indexOf('{')))
    expect(diagnostic.stack).toMatch(/:\d+:\d+/)
    expect(diagnostic.componentStack).toMatch(/:\d+:\d+/)
    expect(logged().join('\n')).not.toContain(draft)
    await page.getByRole('button', { name: 'Reload', exact: true }).click()
    await selectNoteVersion(page, 'mine')
    await expect(page.getByTestId('note-mine')).toHaveText(draft)
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError("Cannot read properties of undefined (reading 'private payload')") }))
      void Promise.reject({ meeting: 'private payload', message: 'private payload' })
    })
    await expect.poll(() => logged().join('\n')).toContain('Cannot read properties of undefined')
    await expect.poll(() => logged().join('\n')).toContain('message omitted for privacy')
    expect(logged().join('\n')).not.toContain('private payload')
    await page.evaluate(() => window.dispatchEvent(new Event('yogurt:renderer-fail')))
    await expect(page.getByTestId('renderer-recovery')).toBeVisible()
    await app.evaluate(({ dialog }) => {
      // A false flush timeout keeps the app open, making the close assertion fail.
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    })
    const quitting = app.waitForEvent('close')
    await app.evaluate(({ app }) => app.quit())
    await quitting
  } finally { if (!closed) await app.close() }
})
