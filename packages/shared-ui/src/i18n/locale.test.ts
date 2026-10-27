import { describe, it, expect } from 'vitest'
import { localeFromLanguage, LOCALES } from './locale.js'

describe('localeFromLanguage', () => {
  it('picks the UI language for a system language tag, English otherwise', () => {
    expect(localeFromLanguage('zh-Hans-CN')).toBe('zh')
    expect(localeFromLanguage('zh-TW')).toBe('zh')
    expect(localeFromLanguage('ja-JP')).toBe('ja')
    expect(localeFromLanguage('KO')).toBe('ko')
    expect(localeFromLanguage('fr-CA')).toBe('fr')
    expect(localeFromLanguage('de')).toBe('de')
    expect(localeFromLanguage('es-419')).toBe('es')
    expect(localeFromLanguage('pt-BR')).toBe('en')
    expect(localeFromLanguage('')).toBe('en')
    expect(LOCALES).toEqual(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'])
  })
})
