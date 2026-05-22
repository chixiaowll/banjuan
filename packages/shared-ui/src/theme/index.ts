import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export type AppTheme = 'xuan-paper' | 'minimal' | 'notebook'

export interface ThemeInfo {
  key: AppTheme
  label: string
  labelZh: string
}

export const APP_THEMES: ThemeInfo[] = [
  { key: 'xuan-paper', label: 'Xuan Paper', labelZh: '宣纸' },
  { key: 'minimal', label: 'Minimal', labelZh: '极简' },
  { key: 'notebook', label: 'Notebook', labelZh: '笔记本' },
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
    if (stored === 'xuan-paper' || stored === 'minimal' || stored === 'notebook') return stored
  } catch {}
  return 'xuan-paper'
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
