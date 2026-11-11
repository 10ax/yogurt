import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  start: null as null | ((meeting: any) => void),
  stop: null as null | ((meeting: any) => void),
  change: null as null | ((meeting: any) => void),
  recording: null as null | ((event: any) => void),
  windows: [] as any[],
  notifications: [] as any[],
  fake: false,
  stopPending: false,
  supported: true,
  finished: vi.fn<() => Promise<void>>(),
  displays: [{ x: 0, y: 0, width: 1200, height: 800 }, { x: -1000, y: -200, width: 1000, height: 900 }],
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    static getAllWindows() { return state.windows }
    bounds: any; options: any; dead = false
    webContents = { send: vi.fn(), once: (_name: string, fn: () => void) => fn() }
    constructor(options: any) { this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; state.windows.push(this) }
    getBounds() { return { ...this.bounds } }
    setBounds(bounds: any) { this.bounds = bounds }
    isDestroyed() { return this.dead }
    isVisible() { return false }
    on() {}
    hide() {}
    showInactive() {}
    destroy() { this.dead = true }
    loadFile() { return Promise.resolve() }
  },
  ipcMain: { on: (name: string, fn: (...args: any[]) => unknown) => state.handlers.set(name, fn), handle: vi.fn() },
  Notification: class {
    static isSupported() { return state.supported }
    options: any
    show = vi.fn(); close = vi.fn(); on = vi.fn()
    constructor(options: any) { this.options = options; state.notifications.push(this) }
  },
  screen: {
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    getDisplayNearestPoint: (p: { x: number; y: number }) => ({ workArea: state.displays[p.x < 0 ? 1 : 0] }),
    getDisplayMatching: (b: { x: number }) => ({ workArea: state.displays[b.x < 0 ? 1 : 0] }),
  },
}))
vi.mock('../src/main/float', async (real) => ({ ...(await real<typeof import('../src/main/float')>()), floatOverFullScreen: vi.fn() }))
vi.mock('../src/main/paths', () => ({ isFake: () => state.fake }))
vi.mock('../src/main/capture', () => ({ onRecordingEvent: (fn: (event: any) => void) => { state.recording = fn }, recordingFinished: () => state.finished() }))
vi.mock('../src/main/meeting', () => ({
  onMeetingStart: (fn: (meeting: any) => void) => { state.start = fn },
  onMeetingChange: (fn: (meeting: any) => void) => { state.change = fn }, onMeetingStop: (fn: (meeting: any) => void) => { state.stop = fn }, stopSavePending: () => state.stopPending,
}))

const send = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!({ sender: win.webContents }, ...args)
let win: any
const open = vi.fn()
let widget: ReturnType<typeof import('../src/main/widget').createWidget>
beforeEach(async () => {
  vi.stubEnv('YOGURT_BACKGROUND', '0')
  vi.resetModules(); state.handlers.clear(); state.windows.length = 0
  state.notifications.length = 0; state.fake = false; state.stopPending = false; state.supported = true
  state.finished.mockReset().mockResolvedValue(); open.mockReset()
  const { createWidget } = await import('../src/main/widget')
  widget = createWidget({ open, stop: vi.fn(), foreground: () => false })
  state.start!({ id: 'meeting', title: 'Review', startedAt: 0 })
  win = state.windows[0]
})
afterEach(() => vi.unstubAllEnvs())

describe('floating recorder placement', () => {
  it('starts as a non-activating panel, accepts the first mouse click, and has no native shadow', () => {
    expect(win.options).toMatchObject({ type: 'panel', width: 127, height: 42, acceptFirstMouse: true, hasShadow: false, roundedCorners: false, focusable: false })
  })
  it('Windows and Linux: a tool window that never takes focus, as there are no panels there', async () => {
    const { createWidget } = await import('../src/main/widget')
    state.windows.length = 0
    createWidget({ open, stop: vi.fn(), foreground: () => false, windowOs: 'win32' })
    state.start!({ id: 'meeting2', title: 'Review', startedAt: 0 })
    expect(state.windows.at(-1).options).toMatchObject({ type: 'toolbar', focusable: false, skipTaskbar: true })
  })
  it('moves in both axes and keeps the chosen location through card resizing and the next meeting', () => {
    const before = win.getBounds()
    send('widget:drag', -300, 70); send('widget:drag-end')
    expect(win.getBounds()).toMatchObject({ x: before.x - 300, y: before.y + 70 })
    const chosen = win.getBounds()
    send('widget:size', 300, 100)
    expect(win.getBounds()).toEqual({ ...chosen, width: 300, height: 100 })
    send('widget:size', 127, 42)
    expect(win.getBounds()).toEqual(chosen)
    win.destroy()
    state.start!({ id: 'next', title: 'Next meeting', startedAt: 1 })
    expect(state.windows[1].getBounds()).toEqual(chosen)
  })
  it('can cross to a display with negative coordinates using successive small deltas', () => {
    const before = win.getBounds()
    send('widget:drag', -before.x, 0)
    for (let n = 0; n < 45; n++) send('widget:drag', -4, -2)
    send('widget:drag-end')
    expect(win.getBounds()).toMatchObject({ x: -180, y: before.y - 90 })
  })
  it('clamps the whole widget to the destination work area and restores its anchor after a card shrinks', () => {
    send('widget:drag', 9999, 9999); send('widget:drag-end')
    expect(win.getBounds()).toEqual({ x: 1073, y: 758, width: 127, height: 42 })
    send('widget:size', 300, 100)
    expect(win.getBounds()).toEqual({ x: 900, y: 700, width: 300, height: 100 })
    send('widget:size', 127, 42)
    expect(win.getBounds()).toEqual({ x: 1073, y: 758, width: 127, height: 42 })
    send('widget:drag', -9999, -9999); send('widget:drag-end')
    expect(win.getBounds()).toEqual({ x: -1000, y: -200, width: 127, height: 42 })
  })
  it('ignores malformed coordinates and dimensions at the IPC boundary', () => {
    const before = win.getBounds()
    for (const pair of [[NaN, 1], [1, Infinity], ['2', 3], [1, undefined]]) send('widget:drag', ...pair)
    for (const pair of [[NaN, 1], [1, Infinity], [0, 0], [601, 400], [100, 401]]) send('widget:size', ...pair)
    expect(win.getBounds()).toEqual(before)
  })
  it('opens a separate hover preview without moving the placed pill at either screen edge', () => {
    send('widget:drag', 9999, 9999); send('widget:drag-end')
    const chosen = win.getBounds()
    send('widget:preview', true)
    const preview = state.windows[1]
    expect(preview).toBeDefined()
    expect(win.getBounds()).toEqual(chosen)
    expect(preview.options).toMatchObject({ type: 'panel', width: 340, hasShadow: false, roundedCorners: false, focusable: false, acceptFirstMouse: true })
    expect(preview.getBounds().x + preview.getBounds().width).toBeLessThanOrEqual(chosen.x)
    expect(preview.getBounds().x + preview.getBounds().width).toBeLessThanOrEqual(1200)
    // Finish removes both floating windows immediately.
    state.stop!({ id: 'meeting' })
    expect(preview.dead).toBe(true)
    expect(win.dead).toBe(true)
    state.handlers.get('widget:size')!({ sender: preview.webContents }, 280, 150)
    expect(win.getBounds()).toEqual(chosen)
  })
  it('fits the preview beside a top-edge pill and sizes only the preview window', () => {
    send('widget:drag', -9999, -9999); send('widget:drag-end')
    const chosen = win.getBounds()
    send('widget:preview', true)
    const preview = state.windows[1]
    state.handlers.get('widget:size')!({ sender: preview.webContents }, 280, 150)
    expect(win.getBounds()).toEqual(chosen)
    expect(preview.getBounds()).toEqual({ x: chosen.x + chosen.width + 8, y: -200, width: 280, height: 150 })
    widget.transcript('transcript:partial', { meetingId: 'meeting', track: 'me', startMs: 12, text: 'Actual incoming words' })
    expect(preview.webContents.send).toHaveBeenCalledWith('transcript:partial', { meetingId: 'meeting', track: 'me', startMs: 12, text: 'Actual incoming words' })
  })
  it('keeps the same preview between hovers so its transcript and reading position stay mounted', () => {
    vi.useFakeTimers()
    try {
      send('widget:preview', true)
      const preview = state.windows[1], hide = vi.spyOn(preview, 'hide')
      send('widget:preview', false)
      vi.advanceTimersByTime(180)
      expect(hide).toHaveBeenCalled()
      expect(preview.dead).toBe(false)
      send('widget:preview', true)
      expect(state.windows).toHaveLength(2)
      expect(preview.dead).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('lets the preview grow to 520px and clamps it to a short display without moving the pill', () => {
    send('widget:drag', 9999, 9999); send('widget:drag-end')
    const chosen = win.getBounds()
    send('widget:preview', true)
    const preview = state.windows[1]
    const size = (height: number) => state.handlers.get('widget:size')!({ sender: preview.webContents }, 340, height)
    size(220)
    const top = preview.getBounds().y
    size(520)
    expect(preview.getBounds().y).toBe(top)
    expect(preview.getBounds().height).toBe(520)
    expect(preview.getBounds().y + 520).toBeLessThanOrEqual(800)
    expect(win.getBounds()).toEqual(chosen)
    size(521)
    expect(preview.getBounds().height).toBe(520)
    const previous = state.displays[0].height
    try {
      state.displays[0].height = 460
      size(520)
      expect(preview.getBounds().height).toBe(460)
      expect(preview.getBounds().y).toBe(0)
      expect(win.getBounds()).toEqual(chosen)
    } finally { state.displays[0].height = previous }
  })
  it('hides an empty preview without changing the pill and restores it when useful content arrives', () => {
    const chosen = win.getBounds()
    send('widget:preview', true)
    const preview = state.windows[1]
    const hide = vi.spyOn(preview, 'hide'), show = vi.spyOn(preview, 'showInactive')
    const size = (width: number, height: number) => state.handlers.get('widget:size')!({ sender: preview.webContents }, width, height)
    size(280, 70)
    expect(show).toHaveBeenCalledTimes(1)
    size(0, 0)
    expect(hide).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledTimes(1)
    // A real warning or transcript gives the existing preview its measured size again.
    state.recording!({ t: 'warn', code: 'no-mic' })
    size(280, 92)
    expect(show).toHaveBeenCalledTimes(2)
    expect(win.getBounds()).toEqual(chosen)
  })
  it('hides the pill and preview on Pause, keeps warnings in app state, and resumes in the same place', () => {
    send('widget:size', 127, 42)
    send('widget:drag', -100, 40); send('widget:drag-end')
    const chosen = win.getBounds(), hide = vi.spyOn(win, 'hide'), show = vi.spyOn(win, 'showInactive')
    send('widget:preview', true)
    const preview = state.windows[1]
    state.recording!({ t: 'paused', meetingId: 'meeting', paused: true, at: 100 })
    expect(widget.snapshot().visible).toBe(false)
    expect(hide).toHaveBeenCalled()
    expect(preview.dead).toBe(true)
    send('widget:size', 0, 0)
    state.recording!({ t: 'warn', code: 'no-mic' })
    widget.visibilityChanged()
    expect(state.windows).toHaveLength(2)
    expect(widget.snapshot().view?.note?.code).toBe('no-mic')
    expect(state.notifications).toHaveLength(0)
    state.recording!({ t: 'paused', meetingId: 'meeting', paused: false, at: 200 })
    send('widget:size', 127, 42)
    expect(widget.snapshot().visible).toBe(true)
    expect(show).toHaveBeenCalled()
    expect(win.getBounds()).toEqual(chosen)
  })
  it('keeps warnings visible without hover, but does not resurrect stale hover after a drag ends', () => {
    const chosen = win.getBounds()
    send('widget:preview', true)
    const preview = state.windows[1]
    send('widget:drag', -20, 10); send('widget:drag-end')
    expect(preview.dead).toBe(true)
    expect(state.windows).toHaveLength(2)
    state.recording!({ t: 'warn', code: 'no-mic' })
    expect(state.windows).toHaveLength(3)
    expect(state.windows[2].dead).toBe(false)
    expect(win.getBounds()).toEqual({ ...chosen, x: chosen.x - 20, y: chosen.y + 10 })
  })
})

describe('finished meeting notifications', () => {
  const stopped = { id: 'meeting', title: 'Review', state: 'stopped', endedAt: 100 }
  const finish = () => { state.stop!(stopped); state.change!(stopped) }
  it('notifies once after the recording settles, closes the pill, and opens that note on click', async () => {
    let settle!: () => void
    state.finished.mockReturnValue(new Promise<void>((resolve) => { settle = resolve }))
    finish(); finish(); state.change!(stopped)
    expect(widget.snapshot()).toMatchObject({ visible: false, bounds: null, notice: null, view: { kind: 'captured' } })
    expect(win.dead).toBe(true)
    expect(state.notifications).toHaveLength(0)
    settle(); await Promise.resolve()
    expect(state.notifications).toHaveLength(1)
    const notice = state.notifications[0]
    expect(notice.options).toEqual({ title: 'Meeting captured', body: 'Review', silent: true })
    expect(notice.show).toHaveBeenCalledOnce()
    notice.on.mock.calls.find(([name]: [string]) => name === 'click')[1]()
    expect(open).toHaveBeenCalledWith('meeting')
    state.change!({ ...stopped, title: 'New title' })
    await Promise.resolve()
    expect(state.notifications).toHaveLength(1)
  })
  it('skips the success banner when the person ended it from the pill, but keeps the in-app notice', async () => {
    send('widget:stop')
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice).toMatchObject({ title: 'Meeting captured', body: 'Review' })
    expect(state.notifications).toHaveLength(0)
  })
  it('skips the success banner when Yogurt was in front, but still warns', async () => {
    vi.resetModules()
    const { createWidget } = await import('../src/main/widget')
    widget = createWidget({ open, stop: vi.fn(), foreground: () => true })
    state.start!({ id: 'meeting', title: 'Review', startedAt: 0 })
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice).toMatchObject({ title: 'Meeting captured' })
    expect(state.notifications).toHaveLength(0)
    state.start!({ id: 'meeting', title: 'Review', startedAt: 0 })
    state.recording!({ t: 'gave-up' })
    finish(); await Promise.resolve()
    expect(state.notifications).toHaveLength(1)
  })
  it('uses the existing save warning and does not notify again when Retry succeeds', async () => {
    state.stopPending = true
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice?.title).toBe('Recording stopped. Open Yogurt to finish saving.')
    expect(widget.snapshot().view?.note?.text).toBe('Recording stopped. Open Yogurt to finish saving.')
    state.stopPending = false; state.change!(stopped)
    await Promise.resolve()
    expect(state.notifications).toHaveLength(1)
    expect(widget.snapshot().visible).toBe(false)
    expect(widget.snapshot().view?.note).toBeNull()
  })
  it('uses the existing stopped warning after capture gives up, rather than claiming completion', async () => {
    state.recording!({ t: 'gave-up' })
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice?.title).toBe('Recording stopped. Your notes are safe.')
    expect(state.notifications[0].options.title).not.toBe('Meeting captured')
  })
  it('notifies for each explicit recording session, including finishing a paused or resumed note', async () => {
    state.recording!({ t: 'paused', meetingId: 'meeting', paused: true, at: 50 })
    finish(); await Promise.resolve()
    expect(state.notifications).toHaveLength(1)
    state.start!({ id: 'meeting', title: 'Review', startedAt: 0, resume: { startedAt: 200, capturedMs: 50 } })
    finish(); await Promise.resolve()
    expect(state.notifications).toHaveLength(2)
  })
  it.each(['fake', 'background', 'unsupported'] as const)('does not deliver a native notification in %s mode', async (mode) => {
    if (mode === 'background') {
      vi.stubEnv('YOGURT_BACKGROUND', '1'); vi.resetModules()
      const { createWidget } = await import('../src/main/widget')
      widget = createWidget({ open, stop: vi.fn(), foreground: () => false })
      state.start!({ id: 'meeting', title: 'Review', startedAt: 0 })
    } else if (mode === 'fake') state.fake = true
    else state.supported = false
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice).toMatchObject({ title: 'Meeting captured', body: 'Review' })
    expect(state.notifications).toHaveLength(0)
  })
  it('does not notify for startup/recovery changes without a recording started in this run', async () => {
    vi.resetModules()
    const { createWidget } = await import('../src/main/widget')
    widget = createWidget({ open, stop: vi.fn(), foreground: () => false })
    finish(); await Promise.resolve()
    expect(widget.snapshot().notice).toBeNull()
    expect(state.notifications).toHaveLength(0)
  })
})
