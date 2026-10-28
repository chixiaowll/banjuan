import { describe, it, expect } from 'vitest'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'
import { markdownToBlocks } from '../src/notes/migration.js'

const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: 'text', text, styles })

// What the editor stores, with the fields the conversion may fill in dropped.
const normalize = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(normalize)
  if (!v || typeof v !== 'object') return v
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    if ((k === 'styles' || k === 'props') && x && typeof x === 'object' && Object.keys(x).length === 0) continue
    if (k === 'children' && Array.isArray(x) && x.length === 0) continue
    out[k] = normalize(x)
  }
  return out
}

const BLOCKS = [
  { type: 'heading', props: { level: 2 }, content: [t('第一章')], children: [] },
  { type: 'paragraph', content: [
    t('见 '), { type: 'noteLink', props: { noteId: 'n-1', title: '[3] P4 冷启动' } },
    t(' 和 '), { type: 'documentLink', props: { docId: 'd1', title: '深度学习' } },
    t('，'), t('重点', { bold: true }),
  ], children: [] },
  { type: 'annotationEmbed', props: { docId: 'd1', annotationId: 'a-1', quote: '第一行\n第二行', comment: '定义\n很重要', docTitle: '深度学习', page: 3 }, children: [] },
  { type: 'annotationEmbed', props: { docId: 'd1', annotationId: '', quote: '没有批注 ID 的摘录', comment: '', docTitle: '深度学习', page: 12 }, children: [] },
  { type: 'documentEmbed', props: { docId: 'd1', docTitle: '深度学习', authors: 'Goodfellow, Bengio', pageCount: 800 }, children: [] },
  { type: 'noteEmbed', props: { noteId: 'n-2', noteTitle: '手写稿', pageIndex: '2' }, children: [] },
  { type: 'paragraph', content: [{ type: 'noteLink', props: { noteId: '', title: '只有标题' } }], children: [] },
]

describe('Markdown for AI (banjuan links)', () => {
  it('reads back to the same blocks: links keep their ids, embeds come back whole', () => {
    const md = blocksToMarkdown(BLOCKS, { banjuanLinks: true })
    expect(md).toContain('[\\[3\\] P4 冷启动](banjuan://note/n-1)')
    expect(md).toContain('> [📄 深度学习 p.3](banjuan://annotation/a-1?doc=d1&page=3)')
    expect(normalize(markdownToBlocks(md))).toEqual(normalize(BLOCKS))
  })

  it('keeps a link to a document page a plain link', () => {
    expect(markdownToBlocks('见 [第 13 页](banjuan://doc/d1?page=13)')).toMatchObject([
      { type: 'paragraph', content: [t('见 '), { type: 'link', href: 'banjuan://doc/d1?page=13' }] },
    ])
  })

  it('leaves files exported as Markdown as they were', () => {
    const md = blocksToMarkdown(BLOCKS)
    expect(md).toContain('[[[3] P4 冷启动]]')
    expect(md).toContain('> 📄 深度学习 p.3')
    expect(md).not.toContain('banjuan://')
  })
})
