import { app } from 'electron'
import { localeFromLanguage } from '@banjuan/shared-ui/src/i18n/locale'
import { getLocale } from './settings-store.js'
import { MESSAGES, isLocale, type MessageKey } from './ui-messages.js'

/** The UI language: as the windows last reported it, else the system's. */
export function currentLocale() {
  const saved = getLocale()
  return isLocale(saved) ? saved : localeFromLanguage(app.getPreferredSystemLanguages()[0] ?? app.getLocale())
}

/** A UI message in that language, for what the main process shows itself. */
export function uiText(key: MessageKey): string {
  return MESSAGES[currentLocale()][key]
}
