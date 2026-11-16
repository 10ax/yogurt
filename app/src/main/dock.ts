import { app, type BrowserWindow } from 'electron'

/** Keep the saved Dock choice even while a window is open. */
export function setDockVisible(on: boolean, window?: BrowserWindow, os = process.platform) {
  if (os !== 'darwin' || !app.dock || app.dock.isVisible() === on) return
  const focused = window && !window.isDestroyed() && window.isFocused()
  // dock.hide() ignores rapid changes after dock.show(); policy changes have no such timer.
  app.setActivationPolicy(on ? 'regular' : 'accessory')
  if (focused) { window.show(); app.focus({ steal: true }); window.focus() }
}
