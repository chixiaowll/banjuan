import zh from '@banjuan/shared-ui/src/i18n/zh'
import en from '@banjuan/shared-ui/src/i18n/en'
import ja from '@banjuan/shared-ui/src/i18n/ja'
import ko from '@banjuan/shared-ui/src/i18n/ko'
import fr from '@banjuan/shared-ui/src/i18n/fr'
import de from '@banjuan/shared-ui/src/i18n/de'
import es from '@banjuan/shared-ui/src/i18n/es'
import { LOCALES, type Locale } from '@banjuan/shared-ui/src/i18n/locale'

/** The UI's own messages (shared-ui i18n), for text the main process shows: the menu bar menu, notices. */
export const MESSAGES = { zh, en, ja, ko, fr, de, es }

export type MessageKey = keyof typeof zh

export function isLocale(s: unknown): s is Locale {
  return typeof s === 'string' && (LOCALES as string[]).includes(s)
}
