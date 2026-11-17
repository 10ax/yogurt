import { BrowserWindow, ipcMain } from 'electron'
import { rendererError } from '../shared/rendererError'

export function hookRendererErrors() {
  ipcMain.on('renderer:error', (event, value: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) return
    if (!value || typeof value !== 'object') return
    // Sanitize again at the IPC boundary; no raw error objects or renderer context reach the log.
    const report = rendererError(value)
    console.error('renderer error', JSON.stringify(report))
  })
}
