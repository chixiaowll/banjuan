import { describe, it, expect } from 'vitest'
import { formatMessage } from './format.js'

describe('formatMessage', () => {
  it('fills positional arguments', () => {
    expect(formatMessage('{0} · {1}', ['a', 2], 'en-US')).toBe('a · 2')
  })

  it('fills every occurrence of a placeholder', () => {
    expect(formatMessage('{0} and {0}', ['x'], 'en-US')).toBe('x and x')
  })

  it('picks the plural form for the language', () => {
    const de = '{0, plural, one {# Dokument} other {# Dokumente}}'
    expect(formatMessage(de, [1], 'de-DE')).toBe('1 Dokument')
    expect(formatMessage(de, [0], 'de-DE')).toBe('0 Dokumente')
    expect(formatMessage(de, [5], 'de-DE')).toBe('5 Dokumente')
    // French treats 0 as singular.
    const fr = '{0, plural, one {# document} other {# documents}}'
    expect(formatMessage(fr, [0], 'fr-FR')).toBe('0 document')
    expect(formatMessage(fr, [2], 'fr-FR')).toBe('2 documents')
  })

  it('prefers an exact =n branch', () => {
    expect(formatMessage('{0, plural, =0 {none} one {# item} other {# items}}', [0], 'en-US')).toBe('none')
  })

  it('handles several plurals and plain text around them', () => {
    const msg = '{0, plural, one {# node} other {# nodes}} · {1, plural, one {# edge} other {# edges}}'
    expect(formatMessage(msg, [1, 3], 'en-US')).toBe('1 node · 3 edges')
  })

  it('accepts a numeric string', () => {
    expect(formatMessage('{0, plural, one {# note} other {# notes}}', ['1'], 'en-US')).toBe('1 note')
  })

  it('leaves the message alone when the argument is missing', () => {
    expect(formatMessage('{0, plural, one {# a} other {# b}}', [], 'en-US')).toBe('{0, plural, one {# a} other {# b}}')
  })
})
