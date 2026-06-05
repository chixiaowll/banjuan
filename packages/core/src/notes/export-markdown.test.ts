import { describe, it, expect } from 'vitest'
import { blocksToMarkdown } from './export-markdown.js'

describe('blocksToMarkdown — reference chips', () => {
  it('serializes an atomic noteLink using props.title', () => {
    const blocks = [
      {
        type: 'bulletListItem',
        props: {},
        content: [
          { type: 'text', text: '新写 ', styles: {} },
          { type: 'noteLink', props: { noteId: 'bdeadf19', title: 'P2P3 增量写作 · 技术方案' } },
          { type: 'text', text: ' （对标 P4 格式）', styles: {} },
        ],
        children: [],
      },
    ]
    expect(blocksToMarkdown(blocks)).toBe('- 新写 [[P2P3 增量写作 · 技术方案]] （对标 P4 格式）')
  })

  it('serializes an atomic documentLink using props.title', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'documentLink', props: { docId: 'doc1', title: '研究报告' } }],
        children: [],
      },
    ]
    expect(blocksToMarkdown(blocks)).toBe('[[研究报告]]')
  })

  it('falls back to legacy inline content text when props.title is absent', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'noteLink', content: [{ type: 'text', text: '旧格式标题', styles: {} }] }],
        children: [],
      },
    ]
    expect(blocksToMarkdown(blocks)).toBe('[[旧格式标题]]')
  })
})
