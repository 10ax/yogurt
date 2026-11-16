import { t } from '../../../shared/i18n'
import type { NoteView } from '../../../shared/types'

export function SummaryWaiting({ part, outline = true }: { part?: NoteView['part']; outline?: boolean }) {
  return <div data-testid="note-enhanced-waiting" className="summary-waiting" aria-live="polite">
    {outline && <div className="summary-outline" aria-hidden="true">
      {[0, 1].map(block => <div key={block} className="summary-outline-block">
        <div className="summary-outline-bar summary-outline-heading" />
        {[0, 1].map(bullet => <div key={bullet} className="summary-outline-bullet">
          <div className="summary-outline-bar" />
        </div>)}
      </div>)}
    </div>}
    <span className="sr-only">{part ? t('Reading a long meeting, part {part} of {of}…', { part: part.part, of: part.of }) : t('Reading the transcript…')}</span>
  </div>
}
