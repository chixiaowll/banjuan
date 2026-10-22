import type { MessageKey } from '../../i18n/index.js'

/**
 * Built-in note templates in the UI language. (The core seeds Chinese-only
 * built-ins for the CLI / API; the app offers these instead.)
 */
export interface BuiltinTemplate {
  key: string
  name: string
  description: string
  /** BlockNote blocks, JSON — passed to notes.create as `content`. */
  content: string
}

type T = (key: MessageKey, ...args: Array<string | number>) => string

const h2 = (text: string) => ({ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text }] })
const p = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })

export function builtinTemplates(t: T): BuiltinTemplate[] {
  return [
    {
      key: 'literature', name: t('template.literature'), description: t('template.literatureDesc'),
      content: JSON.stringify([
        h2(t('template.litSource')), p(t('template.litTitle')), p(t('template.litAuthors')), p(t('template.litYear')),
        h2(t('template.litMainPoints')), p(), h2(t('template.litQuotes')), p(), h2(t('template.litThoughts')), p(),
      ]),
    },
    {
      key: 'zettel', name: t('template.zettel'), description: t('template.zettelDesc'),
      content: JSON.stringify([
        h2(t('template.zettelTopic')), p(), h2(t('template.zettelBody')), p(),
        h2(t('template.zettelRelated')), p(), h2(t('template.zettelSources')), p(),
      ]),
    },
    {
      key: 'meeting', name: t('template.meeting'), description: t('template.meetingDesc'),
      content: JSON.stringify([
        h2(t('template.meetingInfo')), p(t('template.meetingDate')), p(t('template.meetingSubject')),
        h2(t('template.meetingPoints')), p(), h2(t('template.meetingActions')), p(), h2(t('template.meetingSummary')), p(),
      ]),
    },
  ]
}
