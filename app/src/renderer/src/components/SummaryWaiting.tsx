import { t } from '../../../shared/i18n'
import type { NoteView } from '../../../shared/types'

export function SummaryWaiting({ part }: { part?: NoteView['part'] }) {
  return <div data-testid="note-enhanced-waiting" className="summary-waiting" aria-live="polite">
    <div className="summary-outline" aria-hidden="true">
      {[0, 1].map(block => <div key={block} className="summary-outline-block">
        <div className="summary-outline-bar summary-outline-heading" />
        {[0, 1].map(bullet => <div key={bullet} className="summary-outline-bullet">
          <div className="summary-outline-bar" />
        </div>)}
      </div>)}
    </div>
    <span className="note-summary-status"><span className="summary-status-text">{part ? t('Reading a long meeting, part {part} of {of}…', { part: part.part, of: part.of }) : t('Reading the transcript…')}</span></span>
  </div>
}
