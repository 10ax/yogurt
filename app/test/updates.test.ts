import { expect, it } from 'vitest'
import { isPreviewBuild, offersRestart, updatesOn } from '../src/main/updates'

const installed = { packaged: true, fake: false, profile: false, feed: true }

it('an installed Yogurt looks for new versions', () => {
  expect(updatesOn(installed)).toBe(true)
})

it('never while developing, testing, or on a separate profile', () => {
  expect(updatesOn({ ...installed, packaged: false })).toBe(false)
  expect(updatesOn({ ...installed, fake: true })).toBe(false)
  expect(updatesOn({ ...installed, profile: true })).toBe(false)
})

it('a local signed install without app-update.yml never starts the updater', () => {
  expect(updatesOn({ ...installed, feed: false })).toBe(false)
})

it('on Linux only the AppImage can replace itself; Windows uses the installer feed', () => {
  expect(updatesOn({ ...installed, platform: 'linux', appImage: false })).toBe(false)
  expect(updatesOn({ ...installed, platform: 'linux', appImage: true })).toBe(true)
  expect(updatesOn({ ...installed, platform: 'win32', appImage: false })).toBe(true)
  expect(updatesOn({ ...installed, platform: 'darwin', appImage: false })).toBe(true)
})

it('a preview build (unsigned, never released) never looks for new versions, on any computer', () => {
  for (const platform of ['win32', 'linux', 'darwin']) expect(updatesOn({ ...installed, platform, appImage: true, preview: true })).toBe(false)
  expect(updatesOn({ ...installed, preview: false })).toBe(true)
})

it('a preview build is told by its package.json; a release build or anything unreadable is not one', () => {
  expect(isPreviewBuild(JSON.stringify({ name: 'yogurt', yogurtPreview: true }))).toBe(true)
  expect(isPreviewBuild(JSON.stringify({ name: 'yogurt' }))).toBe(false)
  expect(isPreviewBuild('')).toBe(false)
})

const HOUR = 60 * 60 * 1000
const ready = { readyAt: 0, now: 25 * HOUR, snoozedUntil: 0, recording: false, on: true }

it('a downloaded version is offered with Restart only after a day, so someone who quits Yogurt meanwhile never sees it', () => {
  expect(offersRestart({ ...ready, now: 23 * HOUR })).toBe(false)
  expect(offersRestart(ready)).toBe(true)
  expect(offersRestart({ ...ready, readyAt: undefined })).toBe(false)
})

it('never during a recording, with updates off, or while put off until tomorrow', () => {
  expect(offersRestart({ ...ready, recording: true })).toBe(false)
  expect(offersRestart({ ...ready, on: false })).toBe(false)
  expect(offersRestart({ ...ready, snoozedUntil: 26 * HOUR })).toBe(false)
  expect(offersRestart({ ...ready, snoozedUntil: 25 * HOUR })).toBe(true)
})
