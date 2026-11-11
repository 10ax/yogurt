import { dirname } from 'node:path'

/**
 * AppRun points LD_LIBRARY_PATH into the AppImage's mount, and that mount goes away with this process. The next
 * AppImage runtime dlopens libnotify for its FUSE helper's error notice before AppRun runs again, and a library
 * mapped from a mount that is going away kills the loader with SIGBUS. Only an AppImage sets APPDIR.
 */
export function stripAppImageEnv(env: NodeJS.ProcessEnv = process.env) {
  const dir = env.APPDIR
  if (!dir || !env.LD_LIBRARY_PATH) return
  const kept = env.LD_LIBRARY_PATH.split(':').filter((entry) => entry && entry !== dir && !entry.startsWith(`${dir}/`))
  if (kept.length) env.LD_LIBRARY_PATH = kept.join(':')
  else delete env.LD_LIBRARY_PATH
}

/** Launch Services retains the installed app's identity and Info.plist environment after a permission restart. */
export function relaunchOptions(platform: NodeJS.Platform, packaged: boolean, executable: string, appImage?: string) {
  // Linux: the AppImage's mount goes away when Yogurt quits, so the AppImage itself starts again
  if (platform === 'linux' && packaged && appImage) return { execPath: appImage }
  if (platform !== 'darwin' || !packaged) return undefined
  return { execPath: '/usr/bin/open', args: ['-n', '-a', dirname(dirname(dirname(executable)))] }
}
