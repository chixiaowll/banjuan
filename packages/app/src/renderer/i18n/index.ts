import React, { createContext, useContext, useState, useCallback } from 'react'
import zh from './zh.js'
import en from './en.js'

export type Locale = 'zh' | 'en'
type Messages = Record<keyof typeof zh, string>

const locales: Record<Locale, Messages> = { zh, en }

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
    if (stored === 'zh' || stored === 'en') return stored
  } catch {}
  const lang = navigator.language
  if (lang.startsWith('zh')) return 'zh'
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
