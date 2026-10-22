import { describe, it, expect } from 'vitest'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'

describe('blocksToMarkdown', () => {
  it('exports an annotation embed with its source, quote and comment', () => {
    const md = blocksToMarkdown([{ type: 'annotationEmbed', props: { docId: 'd', annotationId: 'a', quote: '注意力就是一切', comment: '核心论点', docTitle: 'Attention', page: 3 } }])
    expect(md).toContain('Attention')
    expect(md).toContain('p.3')
    expect(md).toContain('注意力就是一切')
    expect(md).toContain('核心论点')
  })
})
