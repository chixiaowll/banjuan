import React, { createContext, useContext, useState, useCallback } from 'react'
import zh from './zh.js'
import en from './en.js'
import ja from './ja.js'
import ko from './ko.js'
import fr from './fr.js'
import de from './de.js'
import es from './es.js'

export type Locale = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es'
type Messages = Record<keyof typeof zh, string>

const locales: Record<Locale, Messages> = { zh, en, ja: ja as Messages, ko: ko as Messages, fr: fr as Messages, de: de as Messages, es: es as Messages }

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
  const lang = navigator.language
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('es')) return 'es'
  return 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }, [])

  const t = useCallback((key: keyof Messages, ...args: Array<string | number>): string => {
    let msg: string = locales[locale][key] ?? locales.zh[key] ?? key
    for (let i = 0; i < args.length; i++) {
      msg = msg.replace(`{${i}}`, String(args[i]))
    }
    return msg
  }, [locale])

  return React.createElement(I18nContext.Provider, { value: { locale, setLocale, t } }, children)
}

export function useI18n() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}
