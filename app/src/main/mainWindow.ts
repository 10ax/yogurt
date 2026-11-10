import type { BrowserWindow } from 'electron'

/**
 * What closing the window does: hide it into the menu bar or tray, where Yogurt keeps noticing calls.
 * Windows and Linux without a tray icon (turned off, or GNOME without its extension) minimise instead,
 * so Yogurt never keeps running out of sight.
 */
export const closeAction = (os: string, trayShown: boolean): 'hide' | 'minimize' => (os === 'darwin' || trayShown ? 'hide' : 'minimize')

/** Closing keeps the renderer alive; only the completed save/quit path may destroy it. */
export function keepMainWindow(window: BrowserWindow, d: { background: boolean; canClose(): boolean; activate(): void; closeTo?(): 'hide' | 'minimize'; glass?: boolean }) {
  let ready = false, requested = false, foreground = false
  const show = (bringForward = false) => {
    if (d.background || window.isDestroyed()) return
    requested = true; foreground ||= bringForward
    if (!ready) return
    requested = false
    if (window.isMinimized()) window.restore()
    window.show()
    if (foreground) { window.moveTop(); d.activate() }
    window.focus()
    foreground = false
  }
  window.once('ready-to-show', () => {
    ready = true
    // The theme-matched startup fill is no longer needed; restore the existing native glass.
    if (d.glass !== false) window.setBackgroundColor('#00000000')
    if (requested) show()
  })
  window.on('close', (event) => {
    if (d.canClose()) return
    event.preventDefault()
    requested = false; foreground = false
    if (d.closeTo?.() === 'minimize') window.minimize()
    else window.hide()
  })
  return show
}
