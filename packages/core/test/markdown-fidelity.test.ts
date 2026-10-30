import { describe, it, expect } from 'vitest'
import { markdownToBlocks } from '../src/notes/migration.js'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'

// type:text(children…) — enough to see the structure.
const shape = (blocks: any[]): unknown[] => blocks.map(b => {
  const text = (b.content ?? []).map((c: any) => c.text ?? '').join('')
  const head = `${b.type}${b.props?.checked !== undefined ? (b.props.checked ? '[x]' : '[ ]') : ''}:${text}`
  return b.children?.length ? [head, shape(b.children)] : head
})

describe('Markdown written by AI tools keeps its structure', () => {
  it('nests list items by their indentation (spaces or tabs, bullets, numbers, checkboxes)', () => {
    const md = '- 一级\n  - 二级\n    - 三级\n  - 二级 b\n- 一级 b\n\t1. 编号子项\n\t- [x] 已办子项'
    expect(shape(markdownToBlocks(md))).toEqual([
      ['bulletListItem:一级', [['bulletListItem:二级', ['bulletListItem:三级']], 'bulletListItem:二级 b']],
      ['bulletListItem:一级 b', ['numberedListItem:编号子项', 'checkListItem[x]:已办子项']],
    ])
  })

  it('reads a run of > lines as one quote, and lines of one paragraph as one paragraph', () => {
    expect(shape(markdownToBlocks('> 引用第一行\n> 引用第二行\n\n第一行\n第二行同一段\n\n另一段'))).toEqual([
      'quote:引用第一行\n引用第二行', 'paragraph:第一行\n第二行同一段', 'paragraph:另一段',
    ])
  })

  it('ends a list at a paragraph, and a paragraph at a list or heading', () => {
    expect(shape(markdownToBlocks('- 项\n\n正文\n- 新列表\n## 标题\n文字'))).toEqual([
      'bulletListItem:项', 'paragraph:正文', 'bulletListItem:新列表', 'heading:标题', 'paragraph:文字',
    ])
  })

  it('writes nested lists and quotes back so they read the same', () => {
    const md = '- 一级\n  - 二级\n    - 三级\n- 一级 b\n\n> 引用\n> 两行\n\n一段\n两行'
    const blocks = markdownToBlocks(md)
    expect(shape(markdownToBlocks(blocksToMarkdown(blocks)))).toEqual(shape(blocks))
    expect(shape(markdownToBlocks(blocksToMarkdown(blocks, { banjuanLinks: true })))).toEqual(shape(blocks))
  })
})
