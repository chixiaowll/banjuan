/** The UI languages, and which one a system language tag maps to (renderer and main process). */
export type Locale = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es'

export const LOCALES: Locale[] = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es']

/** The UI language for a BCP 47 tag (navigator.language, the system's preferred language). */
export function localeFromLanguage(lang: string): Locale {
  const l = lang.toLowerCase()
  for (const loc of ['zh', 'ja', 'ko', 'fr', 'de', 'es'] as const) if (l.startsWith(loc)) return loc
  return 'en'
}
