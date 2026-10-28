import { describe, it, expect } from 'vitest'
import { withSearchLinks, withPageLinks, withAnnotationLinks, withNoteLink } from './api-links.js'

const LIB = '/Users/a/书房'
const lib = `library=${encodeURIComponent(LIB).replace(/%20/g, '+')}`

describe('banjuan:// links in API results', () => {
  it('gives each search hit a link: a document at the page it was found on, an annotation in its document, a note', () => {
    const r = withSearchLinks([
      { type: 'document', id: 'd1', page: 4 },
      { type: 'document', id: 'd2', page: null },
      { type: 'annotation', id: 'a1', docId: 'd1', page: 7 },
      { type: 'note', id: 'n1' },
    ], LIB)
    expect(r.map(x => x.link)).toEqual([
      `banjuan://doc/d1?page=4&${lib}`,
      `banjuan://doc/d2?${lib}`,
      `banjuan://annotation/a1?doc=d1&page=7&${lib}`,
      `banjuan://note/n1?${lib}`,
    ])
  })

  it('links every page of a text result, and every annotation', () => {
    expect(withPageLinks({ numPages: 9, pages: [{ page: 2, text: 'x' }] }, 'd1', LIB).pages[0].link).toBe(`banjuan://doc/d1?page=2&${lib}`)
    expect(withAnnotationLinks([{ id: 'a1', docId: 'd1', page: 3 }], LIB)[0].link).toBe(`banjuan://annotation/a1?doc=d1&page=3&${lib}`)
  })

  it('gives a note its link', () => {
    expect(withNoteLink({ id: 'n1', title: 't' }, LIB)).toEqual({ id: 'n1', title: 't', link: `banjuan://note/n1?${lib}` })
  })

  it('leaves results it does not know as they are', () => {
    expect(withSearchLinks([{ type: 'other', id: 'x' }], LIB)[0]).toEqual({ type: 'other', id: 'x' })
  })
})
