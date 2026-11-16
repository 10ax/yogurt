import { expect, it } from 'vitest'
import { summaryPresentation } from '../src/renderer/src/summaryPresentation'

it('keeps first summaries waiting, then streaming, then editable', () => {
  expect(summaryPresentation({ status: 'waiting', enhanced: null, draft: '' })).toBe('waiting')
  expect(summaryPresentation({ status: 'writing', enhanced: null, draft: '' })).toBe('waiting')
  expect(summaryPresentation({ status: 'writing', enhanced: null, draft: 'Partial' })).toBe('streaming')
  expect(summaryPresentation({ status: 'done', enhanced: 'Complete', draft: '' })).toBe('saved')
  expect(summaryPresentation({ status: 'empty', enhanced: null, draft: '' })).toBe('empty')
  expect(summaryPresentation({ status: 'failed', enhanced: null, draft: '' })).toBe('failed')
  expect(summaryPresentation({ status: 'stopped', enhanced: null, draft: 'Abandoned draft' })).toBe('stopped')
})

it.each(['Previous summary', ''])('retains a saved summary through reading, then hands partial drafts to the normal stream (%j)', enhanced => {
  for (const status of ['waiting', 'writing'] as const) {
    for (const draft of ['', '## ', '\n  ']) {
      expect(summaryPresentation({ status, enhanced, draft })).toBe('rewriting')
    }
  }
  expect(summaryPresentation({ status: 'writing', enhanced, draft: '## New heading' })).toBe('streaming')
  expect(summaryPresentation({ status: 'writing', enhanced, draft: '会議' })).toBe('streaming')
})

it('restores the saved editor after failure or stopping, discards abandoned partial drafts', () => {
  for (const status of ['failed', 'done', 'idle', 'empty', 'stopped'] as const) {
    expect(summaryPresentation({ status, enhanced: 'Previous summary', draft: 'Abandoned draft' })).toBe('saved')
  }
  expect(summaryPresentation({ status: 'done', enhanced: 'New saved summary', draft: '' })).toBe('saved')
})
