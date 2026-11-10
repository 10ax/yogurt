/**
 * Linux: Yogurt runs on X11, through XWayland on a Wayland desktop. Native Wayland lets an app neither place its
 * windows nor keep them above others, so the recorder widget and the "Take notes" card couldn't float, and browser
 * call titles can't be read. The switch must be on the command line before Electron starts (appendSwitch is too late
 * for the display server), so a Wayland launch starts once more with it. Its arguments (--hidden) are kept.
 */
export function x11Relaunch(platform: string, argv: string[], env: Record<string, string | undefined>, execPath: string): { execPath: string; args: string[] } | null {
  if (platform !== 'linux' || env.YOGURT_FAKE === '1') return null
  // XWayland is there only with DISPLAY; without it, Wayland is all there is
  if (!env.WAYLAND_DISPLAY || !env.DISPLAY) return null
  if (argv.some((a) => a.startsWith('--ozone-platform'))) return null
  // the AppImage's own mount goes away when it quits: start the AppImage itself
  return { execPath: env.APPIMAGE || execPath, args: [...argv.slice(1), '--ozone-platform=x11'] }
}
