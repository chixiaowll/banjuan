import { describe, it, expect } from 'vitest'
import { buildReadingNoteBlocks } from './readingNote.js'

const t = (key: string, ...args: Array<string | number>) => `${key}(${args.join(',')})`
const doc = { id: 'd1', title: 'Attention', authors: ['Vaswani'] }
const ann = (id: string, page: number | null, extra: Record<string, unknown> = {}) => ({
  id, docId: 'd1', type: 'highlight', page, position: { type: 'pdf', page, rects: [{ x: 0, y: (extra.y as number) ?? 0, w: 1, h: 1 }] },
  content: null, selectedText: `text ${id}`, color: 'yellow', createdAt: `2026-01-0${id.length}T00:00:00Z`, updatedAt: '', ...extra,
})

describe('buildReadingNoteBlocks', () => {
  it('opens with the document, then groups annotations by page in reading order', () => {
    const blocks = buildReadingNoteBlocks(doc, [
      ann('b', 3, { y: 50 }), ann('a', 3, { y: 10 }), ann('c', 1, { content: '重要', selectedText: 'first' }),
    ] as any, t as any)
    expect(blocks[0]).toMatchObject({ type: 'documentEmbed', props: { docId: 'd1', docTitle: 'Attention', authors: 'Vaswani' } })
    const shape = blocks.slice(1).map((b: any) => b.type === 'heading' ? `H:${b.content[0].text}` : `A:${b.props.annotationId}`)
    expect(shape).toEqual(['H:pdf.page(1)', 'A:c', 'H:pdf.page(3)', 'A:a', 'A:b'])
    const c = blocks.find((b: any) => b.props?.annotationId === 'c') as any
    expect(c.props).toMatchObject({ docId: 'd1', quote: 'first', comment: '重要', docTitle: 'Attention', page: 1 })
  })

  it('skips ink (no text) and keeps annotations without a page under one heading', () => {
    const blocks = buildReadingNoteBlocks(doc, [
      ann('x', null, { position: { type: 'epub', cfi: 'epubcfi(/6/2)' } }),
      ann('ink', 2, { type: 'ink', selectedText: null }),
    ] as any, t as any)
    const shape = blocks.slice(1).map((b: any) => b.type === 'heading' ? `H:${b.content[0].text}` : `A:${b.props.annotationId}`)
    expect(shape).toEqual(['H:readingNote.annotations()', 'A:x'])
  })
})
