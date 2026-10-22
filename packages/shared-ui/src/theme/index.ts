import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { getThemeLayout } from './tokens.js'
export type { ThemeLayout } from './tokens.js'

export type AppTheme = 'minimal' | 'notebook'

export interface ThemeInfo {
  key: AppTheme
  /** i18n key of the display name — render with t(labelKey). */
  labelKey: 'theme.notebook' | 'theme.minimal'
}

export const APP_THEMES: ThemeInfo[] = [
  { key: 'notebook', labelKey: 'theme.notebook' },
  { key: 'minimal', labelKey: 'theme.minimal' },
]

interface ThemeContextValue {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>(null!)

const STORAGE_KEY = 'banjuan-app-theme'

function getInitialTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'minimal' || stored === 'notebook') return stored
  } catch {}
  return 'notebook'
}

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

;(() => applyTheme(getInitialTheme()))()

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t)
    applyTheme(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
  }, [])

  useEffect(() => { applyTheme(theme) }, [theme])

  return React.createElement(ThemeContext.Provider, { value: { theme, setTheme } }, children)
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function useThemeLayout() {
  const { theme } = useContext(ThemeContext)
  return useMemo(() => getThemeLayout(theme), [theme])
}
