import { describe, it, expect } from 'vitest'
import { extractNoteLinks, resolveNoteLinks } from '../src/notes/extract-links.js'
import { markdownToBlocks } from '../src/notes/migration.js'

describe('extractNoteLinks title-only links', () => {
  it('keeps markdown-imported (noteId="") links with their title', () => {
    const blocks = markdownToBlocks('引用 [[[2] 调研进展报告]] 和 [[[3] P1 门控路由 · 设计]]')
    const links = extractNoteLinks(blocks)
    expect(links).toEqual([
      { targetId: '', targetTitle: '[2] 调研进展报告', context: '[2] 调研进展报告' },
      { targetId: '', targetTitle: '[3] P1 门控路由 · 设计', context: '[3] P1 门控路由 · 设计' },
    ])
  })

  it('still extracts id-based links as before', () => {
    const blocks = [{ type: 'paragraph', content: [{ type: 'noteLink', props: { noteId: 'abc', title: 'T' } }], children: [] }]
    expect(extractNoteLinks(blocks)).toEqual([{ targetId: 'abc', context: 'T' }])
  })

  it('extracts title-only note embeds', () => {
    const blocks = markdownToBlocks('![[[0] 进展总览]]')
    expect(extractNoteLinks(blocks)).toEqual([
      { targetId: '', targetTitle: '[0] 进展总览', context: '[0] 进展总览' },
    ])
  })
})

describe('resolveNoteLinks', () => {
  const titleToId = (t: string) => ({ '[2] 调研进展报告': 'id-report', '自引': 'self-id' } as Record<string, string>)[t]

  it('resolves titles to ids, drops unresolved and self links, dedupes', () => {
    const resolved = resolveNoteLinks(
      [
        { targetId: '', targetTitle: '[2] 调研进展报告', context: 'a' },
        { targetId: '', targetTitle: '[2] 调研进展报告', context: 'dup' },
        { targetId: '', targetTitle: '不存在', context: 'b' },
        { targetId: '', targetTitle: '自引', context: 'c' },
        { targetId: 'direct-id', context: 'd' },
      ],
      'self-id',
      titleToId,
    )
    expect(resolved).toEqual([
      { targetId: 'id-report', context: 'a' },
      { targetId: 'direct-id', context: 'd' },
    ])
  })
})
