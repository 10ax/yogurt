import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

if (existsSync(join(homedir(), '.yogurt-no-local-e2e'))) {
  throw new Error('Yogurt E2E is disabled on this Mac by ~/.yogurt-no-local-e2e. Run typecheck, Vitest and lint locally; push and read E2E results on CI. Do not launch Electron under Playwright here.')
}

// Yogurt runs hidden during tests so it never pops up or takes focus; YOGURT_BACKGROUND=0 to watch
process.env.YOGURT_BACKGROUND ??= '1'
// tests read the English text, whatever this computer's language
process.env.YOGURT_SYSTEM_LANGUAGES ??= 'en-US'
// Runs happen where it's about midday, so none crosses midnight: the fake standup "in five minutes" stays today, and
// "today" in the app and in the test is the same day. Etc/GMT+N is UTC-N (the sign is flipped), with no daylight saving.
// Set once here; the workers and the app inherit it.
const toNoon = 12 - new Date().getUTCHours()
process.env.TZ ??= `Etc/GMT${toNoon > 0 ? '-' : '+'}${Math.abs(toNoon)}`

// CI machines are slower: a test that only passes on its second try is reported as flaky, not hidden
export default defineConfig({
  testDir: 'e2e', timeout: 60_000, retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['dot']] : 'list',
  testIgnore: process.env.CI ? ['**/zz-*.spec.ts', '**/zz-fixtures/**'] : [],
})
