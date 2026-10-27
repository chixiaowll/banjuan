import React, { createContext, useContext, useState, useCallback } from 'react'
import zh from './zh.js'
import en from './en.js'
import ja from './ja.js'
import ko from './ko.js'
import fr from './fr.js'
import de from './de.js'
import es from './es.js'
import { formatMessage } from './format.js'
import { localeFromLanguage, type Locale } from './locale.js'

export type { Locale }

/** BCP 47 tag of each UI language, for Intl / toLocaleDateString / toLocaleTimeString. */
export const LOCALE_TAGS: Record<Locale, string> = {
  zh: 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES',
}
export type MessageKey = keyof typeof zh
type Messages = Record<MessageKey, string>

// No casts: a locale missing any key is a compile error (a missing key used to
// render as the raw key, e.g. "video.noScreenshots").
const locales: Record<Locale, Messages> = { zh, en, ja, ko, fr, de, es }

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: keyof Messages, ...args: Array<string | number>) => string
}

const I18nContext = createContext<I18nContextValue>(null!)

const STORAGE_KEY = 'banjuan-locale'

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in locales) return stored as Locale
  } catch {}
  return localeFromLanguage(navigator.language)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }, [])

  const t = useCallback((key: keyof Messages, ...args: Array<string | number>): string => {
    const msg: string = locales[locale][key] ?? locales.zh[key] ?? key
    return formatMessage(msg, args, LOCALE_TAGS[locale])
  }, [locale])

  return React.createElement(I18nContext.Provider, { value: { locale, setLocale, t } }, children)
}

export function useI18n() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}

/** For code outside components (exports): a message in the language the UI is set to. */
export function translate(key: MessageKey, ...args: Array<string | number>): string {
  const locale = getInitialLocale()
  const msg: string = locales[locale][key] ?? locales.zh[key] ?? key
  return formatMessage(msg, args, LOCALE_TAGS[locale])
}
