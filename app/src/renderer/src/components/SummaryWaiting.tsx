import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../../shared/i18n'
import type { NoteView } from '../../../shared/types'

export function SummaryWaiting({ part, outline = true, writing = false }: { part?: NoteView['part']; outline?: boolean; writing?: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [frame, setFrame] = useState<Element | null>(null)
  useLayoutEffect(() => {
    if (!outline) setFrame(anchor.current?.closest('.note-reading-frame') ?? null)
  }, [outline])
  const content = <div data-testid="note-enhanced-waiting" className="summary-waiting" aria-live="polite">
    {outline && <div className="summary-outline" aria-hidden="true">
      {[0, 1].map(block => <div key={block} className="summary-outline-block">
        <div className="summary-outline-bar summary-outline-heading" />
        {[0, 1].map(bullet => <div key={bullet} className="summary-outline-bullet">
          <div className="summary-outline-bar" />
        </div>)}
      </div>)}
    </div>}
    <span className="note-summary-status"><span className="summary-status-text">{writing ? t('Generating notes…') : part ? t('Reading a long meeting, part {part} of {of}…', { part: part.part, of: part.of }) : t('Reading the transcript…')}</span></span>
  </div>
  // The scroller masks its descendants; the rewrite label belongs in the frame's reserved lane.
  return outline ? content : <><span ref={anchor} hidden />{frame ? createPortal(content, frame) : content}</>
}
