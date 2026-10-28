import { describe, it, expect } from 'vitest'
import { formatLink, parseLink, linkPage } from '../src/notes/links.js'

describe('banjuan links', () => {
  it('writes and reads doc / annotation / note links with their query', () => {
    expect(formatLink('doc', 'abc123', { page: 3, library: '/Users/a b/书房' })).toBe('banjuan://doc/abc123?page=3&library=%2FUsers%2Fa+b%2F%E4%B9%A6%E6%88%BF')
    expect(parseLink('banjuan://doc/abc123?page=3&library=%2FUsers%2Fa+b%2F%E4%B9%A6%E6%88%BF')).toEqual({ kind: 'doc', id: 'abc123', query: { page: '3', library: '/Users/a b/书房' } })
    expect(parseLink(formatLink('annotation', 'a-1', { doc: 'd1', page: 7 }))).toEqual({ kind: 'annotation', id: 'a-1', query: { doc: 'd1', page: '7' } })
    expect(formatLink('note', 'n1')).toBe('banjuan://note/n1')
    expect(formatLink('doc', 'd', { page: undefined, authors: '' })).toBe('banjuan://doc/d')
    expect(parseLink('banjuan://note/n1/')).toEqual({ kind: 'note', id: 'n1', query: {} })
  })

  it('refuses anything else', () => {
    for (const bad of ['https://x/doc/1', 'banjuan://book/1', 'banjuan://doc/', 'banjuan://doc/a/b', 'banjuan://doc/a%2Fb', 'banjuan://doc/' + 'x'.repeat(65), 'banjuan://doc/a b'])
      expect(parseLink(bad)).toBeNull()
  })

  it('reads a page only when it is a whole number from 1 up', () => {
    expect(linkPage({ page: '12' })).toBe(12)
    for (const p of ['0', '-1', '1.5', 'x', undefined]) expect(linkPage({ page: p as string })).toBeUndefined()
  })
})
