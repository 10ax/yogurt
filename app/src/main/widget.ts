import { BrowserWindow, ipcMain, Notification, screen } from 'electron'
import { join } from 'node:path'
import type { Meeting } from './store'
import { WidgetModel } from './widgetModel'
import { onRecordingEvent, recordingFinished } from './capture'
import { onMeetingChange, onMeetingStart, onMeetingStop, stopSavePending } from './meeting'
import type { WidgetView } from '../shared/types'
import { floatingType, floatOverFullScreen } from './float'
import { isFake } from './paths'
import { t, onLanguage } from '../shared/i18n'

const BACKGROUND = process.env.YOGURT_BACKGROUND === '1'
const FIRST_W = 127, FIRST_H = 42
const PREVIEW_W = 340, PREVIEW_H = 220, PREVIEW_MAX_H = 520, PREVIEW_GAP = 8

/** Remembered while Yogurt runs, including the next meeting and temporary warning cards. */
let lastPosition: { x: number; y: number } | null = null

function fit(bounds: Electron.Rectangle): Electron.Rectangle {
  const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) })
  return {
    ...bounds,
    x: Math.max(workArea.x, Math.min(workArea.x + workArea.width - bounds.width, Math.round(bounds.x))),
    y: Math.max(workArea.y, Math.min(workArea.y + workArea.height - bounds.height, Math.round(bounds.y))),
  }
}

function createWindow(preview = false, os = 'darwin'): BrowserWindow {
  // the display the person is working on (the mouse is there), not always the main one
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = fit({ width: FIRST_W, height: FIRST_H, ...(lastPosition ?? { x: workArea.x + workArea.width - FIRST_W - 12, y: Math.round(workArea.y + workArea.height * 0.38) }) })
  if (!preview) lastPosition = { x: bounds.x, y: bounds.y }
  const w = new BrowserWindow({
    ...bounds,
    // Neither surface may activate Yogurt on mouse-down; only an explicit pill click opens the note.
    type: floatingType(os, 'panel'),
    ...(preview ? { width: PREVIEW_W, height: PREVIEW_H } : {}),
    // CSS owns the outline; macOS corner clipping cuts through its border.
    frame: false, transparent: true, roundedCorners: false, hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, acceptFirstMouse: true, show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: false, backgroundThrottling: false },
  })
  floatOverFullScreen(w)
  const hash = preview ? 'widget-preview' : 'widget'
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  return w
}

/** every window: the pill draws the level, and the note's recording bar does too */
const broadcast = (channel: string, v: unknown) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, v) }

/**
 * The recording-only pill and its separate hovered transcript/warning. Finished
 * meetings use a native notification; paused meetings keep no floating surface.
 */
export function createWidget(d: { open(meetingId: string): void; stop(meetingId: string): void; foreground(): boolean; os?: string
  /** the computer the windows are made for (a Mac's panel, a tool window elsewhere) */
  windowOs?: string }) {
  const model = new WidgetModel(d.os)
  let win: BrowserWindow | undefined
  let preview: BrowserWindow | undefined
  let previewSized = false, hovered = false
  let previewTimer: NodeJS.Timeout | undefined
  let sized = false
  let dragPosition: { x: number; y: number } | null = null
  let noteTimer: NodeJS.Timeout | undefined
  let notifyOnChange = false
  let notice: { title: string; body: string; meetingId: string } | null = null
  let notification: Notification | undefined
  /** what a test can see: the window itself is hidden in tests */
  let shown = false

  const closePreview = () => {
    clearTimeout(previewTimer)
    if (preview && !preview.isDestroyed()) preview.destroy()
    preview = undefined; previewSized = false
  }
  const positionPreview = (width = PREVIEW_W, height = PREVIEW_H) => {
    if (!win || win.isDestroyed() || !preview || preview.isDestroyed()) return
    const pill = win.getBounds()
    const { workArea } = screen.getDisplayMatching(pill)
    width = Math.min(width, workArea.width); height = Math.min(height, workArea.height)
    const below = pill.y + pill.height + PREVIEW_GAP
    const above = pill.y - height - PREVIEW_GAP
    const left = pill.x - width - PREVIEW_GAP
    const right = pill.x + pill.width + PREVIEW_GAP
    const beside = left >= workArea.x ? left : right + width <= workArea.x + workArea.width ? right : null
    // Reserve room for speech to grow without moving the reading edge of a side-by-side preview.
    const besideY = Math.min(workArea.y + workArea.height - Math.min(PREVIEW_MAX_H, workArea.height), Math.round(pill.y + pill.height / 2 - PREVIEW_H * .65))
    const y = beside === null ? (above >= workArea.y ? above : below) : besideY
    preview.setBounds({ width, height,
      x: Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, beside ?? Math.round(pill.x + (pill.width - width) / 2))),
      y: Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, y)),
    })
  }
  const syncPreview = () => {
    const v = model.view(Date.now())
    // A recording warning stays visible even when nobody hovers over the recorder.
    if (!shown || v?.kind !== 'recording' || dragPosition) { closePreview(); return }
    // Keep the reading position and settled text when the pointer briefly leaves the conversation.
    if (!hovered && !v.note) { if (preview && !preview.isDestroyed()) preview.hide(); return }
    if (!preview || preview.isDestroyed()) { preview = createWindow(true, d.windowOs); previewSized = false; positionPreview() }
    if (previewSized && !BACKGROUND && !preview.isVisible()) preview.showInactive()
  }

  const visibilityChanged = () => {
    const view = model.view(Date.now())
    shown = view?.kind === 'recording' && !view.paused && !d.foreground()
    if (!shown) hovered = false
    syncPreview()
    if (!win || win.isDestroyed() || BACKGROUND) return
    if (!shown) win.hide()
    else if (sized && !win.isVisible()) win.showInactive()
  }

  const push = () => { broadcast('widget:state', model.view(Date.now())); visibilityChanged() }
  // its hints are written here, so a new interface language sends them again
  onLanguage(() => { if (win && !win.isDestroyed()) push() })
  const close = () => {
    clearTimeout(noteTimer)
    shown = false; sized = false; dragPosition = null
    hovered = false; closePreview()
    if (win && !win.isDestroyed()) win.destroy()
    win = undefined
  }
  const open = () => {
    if (win && !win.isDestroyed()) return
    win = createWindow(false, d.windowOs); sized = false
    win.on('closed', () => { win = undefined })
  }

  onMeetingStart((m) => {
    notifyOnChange = false; notice = null
    model.start({ id: m.id, title: m.title, startedAt: m.resume ? m.resume.startedAt - m.resume.capturedMs : m.startedAt })
    open(); push()
  })
  onMeetingStop((m: Meeting) => {
    if (model.meetingId !== m.id || model.view(Date.now())?.kind !== 'recording') return
    // The following change event reports whether the stopped metadata was saved.
    model.stop(Date.now())
    notifyOnChange = true
    close(); push()
  })
  // renamed in the note while it records
  onMeetingChange((m: Meeting) => {
    if (model.meetingId !== m.id) return
    model.retitle(m.title)
    model.stopSavePending(stopSavePending(m.id))
    const view = model.view(Date.now())
    if (notifyOnChange && view?.kind === 'captured') {
      notifyOnChange = false
      const completed = { title: view.note?.text ?? (view.crashed ? t('Recording stopped. Your notes are safe.') : t('Meeting captured')), body: m.title, meetingId: m.id }
      void recordingFinished(m.id).then(() => {
        // The call-ended prompt already owns its native notification.
        if (view.callEnded) return
        notice = completed
        if (BACKGROUND || isFake() || !Notification.isSupported()) return
        notification?.close()
        notification = new Notification({ title: completed.title, body: completed.body, silent: true })
        notification.on('click', () => d.open(completed.meetingId))
        notification.show()
      }).catch((error) => console.error('could not notify after recording', error))
    }
    push()
  })
  onRecordingEvent((e) => {
    if (!model.meetingId) return
    if (e.t === 'level') broadcast('widget:level', { me: e.me, them: e.them })
    else if (e.t === 'paused' && e.meetingId === model.meetingId) { model.pause(e.paused, e.at); push() }
    else if (e.t === 'warn') { model.warn(e.code); push() }
    else if (e.t === 'gave-up') model.gaveUp()
    else if (e.t === 'hiccup') {
      model.hiccup(Date.now()); push()
      // the hiccup note leaves by itself
      clearTimeout(noteTimer)
      noteTimer = setTimeout(push, 4100)
    }
  })

  ipcMain.handle('widget:state', () => model.view(Date.now()))
  ipcMain.on('widget:open', () => {
    const id = model.meetingId
    if (!id) return
    shown = false
    hovered = false; closePreview()
    if (win && !win.isDestroyed()) win.hide()
    d.open(id)
  })
  ipcMain.on('widget:stop', () => { const id = model.meetingId; if (id && model.view(Date.now())?.kind === 'recording') d.stop(id) })
  ipcMain.on('widget:preview', (_e, on: unknown) => {
    if (typeof on !== 'boolean') return
    clearTimeout(previewTimer)
    if (on) { hovered = true; syncPreview() }
    // The small gap between windows must not close the preview while the pointer crosses it.
    else previewTimer = setTimeout(() => { hovered = false; syncPreview() }, 180)
  })
  ipcMain.on('widget:drag', (_e, dx: unknown, dy: unknown) => {
    if (!win || win.isDestroyed() || typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    const b = win.getBounds(), from = dragPosition ?? b
    const x = from.x + dx, y = from.y + dy
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    // Keep the unclamped gesture position so small deltas can cross a display boundary.
    dragPosition = { x, y }
    closePreview()
    win.setBounds(fit({ ...b, x, y }))
  })
  ipcMain.on('widget:drag-end', () => {
    if (dragPosition && win && !win.isDestroyed()) {
      const { x, y } = win.getBounds()
      lastPosition = { x, y }
    }
    dragPosition = null; hovered = false
    syncPreview()
  })
  ipcMain.on('widget:size', (_e, w: unknown, h: unknown) => {
    if (!win || win.isDestroyed() || typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0 || w > 600 || h > PREVIEW_MAX_H) return
    if (preview && !preview.isDestroyed() && _e.sender === preview.webContents) {
      // A paused meeting with no words or warning needs no empty hover window.
      if (w === 0 && h === 0) { previewSized = false; preview.hide(); return }
      if (!w || !h) return
      positionPreview(Math.ceil(w), Math.ceil(h)); previewSized = true; syncPreview(); return
    }
    // A final ResizeObserver message from a closed preview must never resize the recorder.
    if (_e.sender !== win.webContents || h > 400) return
    if (w === 0 && h === 0) { sized = false; win.hide(); return }
    if (!w || !h) return
    const b = win.getBounds()
    win.setBounds(fit({ ...(dragPosition ?? lastPosition ?? b), width: Math.ceil(w), height: Math.ceil(h) }))
    // Show after the first fit so the recorder never flashes at the wrong size.
    if (!sized) { sized = true; visibilityChanged() }
  })

  return {
    visibilityChanged,
    elapsed: () => model.view(Date.now())?.elapsedMs ?? 0,
    /** the recording is about to stop because its call ended: the finished card says so */
    callEnded: (meetingId: string) => { if (model.meetingId === meetingId) model.callEnded() },
    /** The same actual transcript events used by the main note, delivered only to the small preview. */
    transcript: (channel: string, value: unknown) => { if (preview && !preview.isDestroyed()) preview.webContents.send(channel, value) },
    /** for tests: what the widget would show, and where it sits */
    snapshot: (): { visible: boolean; view: WidgetView | null; notice: typeof notice; bounds: Electron.Rectangle | null; workArea: Electron.Rectangle } =>
      ({ visible: shown, view: model.view(Date.now()), notice, bounds: win && !win.isDestroyed() ? win.getBounds() : null, workArea: (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea }),
  }
}
