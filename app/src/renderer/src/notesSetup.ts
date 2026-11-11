import type { SetupState } from '../../shared/types'
import { language } from '../../shared/i18n'

export const notesPercent = (fraction: number) => new Intl.NumberFormat(language(), { style: 'percent', maximumFractionDigits: 0 })
  .format(Math.floor(Math.max(0, Math.min(1, fraction)) * 100) / 100)

/** Skip cached installs and flashes; announce only a download visible for at least a second. */
export function notesReadyNotice() {
  let since: number | undefined, noticed = false, announced = false
  return (setup: SetupState, visible: boolean, now: number): boolean => {
    if (announced) return false
    if (since !== undefined && now - since >= 1000) noticed = true
    const waiting = setup.notesDownloading || !!setup.notesError
    if (setup.phase === 'ready' && waiting && visible) since ??= now
    else since = undefined
    if (setup.phase !== 'ready' || waiting || !noticed) return false
    announced = true
    return true
  }
}
