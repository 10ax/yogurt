import { ChevronDown, FileText, Folder } from 'lucide-react'
import type { ContextTarget } from '../../../shared/askContext'
import { tx } from '../i18n'
import { t } from '../../../shared/i18n'

export const chipTitle = (c: ContextTarget) => c.title.trim() || (c.kind === 'meeting' ? t('Untitled meeting') : t('Folder'))
export const scopeLabel = (chips: ContextTarget[]) => ({
  name: chips.length ? chipTitle(chips[0]) : t('All meetings'),
  others: chips.length > 1 ? t('and {count} others', { count: chips.length - 1 }) : '',
})

export function AskContext({ chips }: { chips: ContextTarget[] }) {
  const label = scopeLabel(chips)
  const Icon = chips[0]?.kind === 'folder' ? Folder : FileText
  return <>{!!chips.length && <Icon size={14} aria-hidden="true" />}<span className="ask-scope-label"><span className="ask-scope-name">{label.name}</span>
    {label.others && <span className="ask-scope-others">{` ${label.others}`}</span>}</span><ChevronDown size={12} aria-hidden="true" /></>
}


export function AnswerScope({ chips }: { chips: ContextTarget[] }) {
  const label = scopeLabel(chips)
  return <span className="chat-answer-scope" title={chips.length ? chips.map(chipTitle).join('\n') : label.name}>
    {chips.length ? tx('Searched {name}', { name: <span className="ask-scope-label"><span className="ask-scope-name">{label.name}</span>
      {label.others && <span className="ask-scope-others">{` ${label.others}`}</span>}</span> }) : t('Searched all meetings')}
  </span>
}
