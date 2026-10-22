import { describe, it, expect } from 'vitest'
import { highlightParts, searchTerms } from './searchHighlight.js'

describe('searchTerms', () => {
  it('splits on whitespace, lowercases and de-duplicates', () => {
    expect(searchTerms('  机器学习  Attention attention ')).toEqual(['机器学习', 'attention'])
    expect(searchTerms('   ')).toEqual([])
  })
})

describe('highlightParts', () => {
  it('marks every case-insensitive occurrence of any term', () => {
    expect(highlightParts('Self-Attention 与 attention 机制', ['attention', '机制'])).toEqual([
      { text: 'Self-', hit: false }, { text: 'Attention', hit: true }, { text: ' 与 ', hit: false },
      { text: 'attention', hit: true }, { text: ' ', hit: false }, { text: '机制', hit: true },
    ])
  })
  it('prefers the longer term where terms overlap and handles no terms', () => {
    expect(highlightParts('机器学习', ['学', '机器学习'])).toEqual([{ text: '机器学习', hit: true }])
    expect(highlightParts('abc', [])).toEqual([{ text: 'abc', hit: false }])
  })
})
