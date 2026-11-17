import { afterEach, expect, it, vi } from 'vitest'
import { rendererError } from '../src/shared/rendererError'
import { installRendererErrors, reportRendererError } from '../src/renderer/src/rendererErrors'
import { hookRendererErrors } from '../src/main/rendererErrors'

const ipc = vi.hoisted(() => ({ on: vi.fn(), fromWebContents: vi.fn(() => ({})) }))
vi.mock('electron', () => ({ ipcMain: { on: ipc.on }, BrowserWindow: { fromWebContents: ipc.fromWebContents } }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const sensitive = 'private meeting wording'
const error = () => ({
  message: `Cannot read properties of undefined (reading '${sensitive}')`,
  stack: `TypeError: ${sensitive}\n    at TranscriptFind (file:///Users/private-person/app/index-abc.js:51:9)\n${sensitive}`,
  componentStack: '\n    at TranscriptFind (file:///Users/private-person/app/index-abc.js:51:9)',
  note: sensitive, cause: { text: sensitive },
})
it('keeps runtime diagnostics and code frames without document values, paths, source excerpts or extra fields', () => {
  const report = rendererError(error())
  expect(report).toEqual({ message: 'Cannot read properties of undefined', stack: '    at TranscriptFind (index-abc.js:51:9)', componentStack: '    at TranscriptFind (index-abc.js:51:9)' })
  expect(rendererError(report)).toEqual(report)
  expect(JSON.stringify(report)).not.toMatch(/private|note|cause|Users/)
  expect(rendererError(new Error(sensitive)).message).toBe('Error (message omitted for privacy)')
  const range = rendererError({ name: 'IndexSizeError', message: `Failed to execute 'setStart' on 'Range': ${sensitive}` })
  expect(range.message).toBe("Failed to execute 'setStart' on 'Range': operation failed")
  expect(rendererError(range)).toEqual(range)
  expect(rendererError(sensitive).message).not.toContain(sensitive)
  expect(rendererError({ message: 'SyntaxError', stack: `Error: ${sensitive}\n    at parse (https://host/index.js?text=${sensitive}:1:2)` }).stack).toBe('')
  expect(rendererError({ get message() { throw new Error(sensitive) } })).toEqual(rendererError(null))
  expect(rendererError({ message: 'Minified React error #185; visit https://react.dev/errors/185?args[]=private' }).message).toBe('Minified React error #185;')
  expect(rendererError({ stack: Array(100).fill('    at App (index.js:1:2)').join('\n') }).stack.split('\n')).toHaveLength(40)
})
it('forwards global errors and rejections without serializing arbitrary rejection payloads, and removes listeners', () => {
  const send = vi.fn(), win = Object.assign(new EventTarget(), { yogurt: { reportRendererError: send } })
  vi.stubGlobal('window', win)
  const stop = installRendererErrors()
  const thrown = Object.assign(new Event('error'), { error: Object.assign(new TypeError(), error()) })
  win.dispatchEvent(thrown)
  win.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: { note: sensitive, message: sensitive, stack: '    at PrivateMeeting (private-person.js:1:2)' } }))
  expect(send.mock.calls).toEqual([[rendererError(error(), '')], [rendererError(null)]])
  stop(); win.dispatchEvent(thrown)
  expect(send).toHaveBeenCalledTimes(2)
  send.mockImplementation(() => { throw new Error('bridge unavailable') })
  expect(() => reportRendererError(error())).not.toThrow()
})
it('main logs only the sanitized three fields from an app main frame', () => {
  hookRendererErrors()
  const receive = ipc.on.mock.calls[0][1]
  const frame = {}, event = { sender: { mainFrame: frame }, senderFrame: frame }
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  receive(event, error())
  expect(log).toHaveBeenCalledWith('renderer error', JSON.stringify(rendererError(error())))
  expect(log.mock.calls.flat().join(' ')).not.toContain(sensitive)
  receive({ ...event, senderFrame: {} }, error())
  ipc.fromWebContents.mockReturnValueOnce(null as never)
  receive(event, error())
  receive(event, sensitive)
  expect(log).toHaveBeenCalledOnce()
})
