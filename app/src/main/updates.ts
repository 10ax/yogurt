import { Notification } from 'electron'
import { t } from '../shared/i18n'

/** checking again while Yogurt stays open for days */
const EVERY_MS = 4 * 60 * 60 * 1000

/**
 * Installed copies update themselves from GitHub Releases (latest-mac.yml, latest.yml for the Windows installer,
 * latest-linux.yml). Not while developing, testing, or on a separate profile; on Linux only the AppImage can replace itself.
 * Never in a preview build (preview.yml by hand): it was never released, so there is nothing to look for.
 */
export function updatesOn(o: { packaged: boolean; fake: boolean; profile: boolean; feed: boolean; platform?: string; appImage?: boolean; preview?: boolean }): boolean {
  return o.packaged && !o.fake && !o.profile && o.feed && !o.preview && (o.platform !== 'linux' || !!o.appImage)
}

/** preview.yml marks a build made by hand (not for a release) in the packaged package.json */
export const isPreviewBuild = (packageJson: string): boolean => {
  try { return JSON.parse(packageJson).yogurtPreview === true } catch { return false }
}

/** Downloads a new version in the background; it installs the next time Yogurt quits. */
export async function startUpdates(): Promise<void> {
  // loaded here: it reads Electron's app as it loads, which tests don't have
  const { autoUpdater } = (await import('electron-updater')).default
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('error', (err) => console.warn('checking for a new version failed', err.message))
  autoUpdater.on('update-downloaded', (info) => {
    if (!Notification.isSupported()) return
    new Notification({ title: t('Yogurt {version} is ready', { version: info.version }), body: t('It installs the next time you quit Yogurt.') }).show()
  })
  const check = () => { autoUpdater.checkForUpdates().catch(() => {}) }
  setTimeout(check, 30_000)
  setInterval(check, EVERY_MS)
}
