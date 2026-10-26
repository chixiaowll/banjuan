import { describe, it, expect, vi } from 'vitest'
import { translate } from '../i18n/index.js'

vi.mock('../components/MindmapExportService.js', () => ({ renderMindmapToImage: vi.fn(async () => 'data:image/png;base64,AAAA') }))
vi.mock('../components/handwriting/renderStrokes.js', () => ({ renderStroke: vi.fn() }))

const { exportBlocksToMarkdown, exportBlocksToHTML } = await import('./noteExport.js')

// A tiny stand-in for BlockNote's lossy serializers: paragraphs and bullet items,
// children indented four spaces / nested in the <li>. It throws on blocks it
// doesn't know — like the real one can on our custom blocks.
const text = (b: any) => typeof b.content === 'string' ? b.content : (b.content ?? []).map((c: any) => c.text).join('')
const editor = {
  async blocksToMarkdownLossy(blocks: any[]): Promise<string> {
    const md = (list: any[], indent: string): string[] => list.flatMap(b => {
      if (b.type !== 'paragraph' && b.type !== 'bulletListItem') throw new Error(`unknown block ${b.type}`)
      const line = indent + (b.type === 'bulletListItem' ? '* ' : '') + text(b)
      return [line, ...md(b.children ?? [], indent + '    ')]
    })
    return md(blocks, '').join('\n\n') + '\n'
  },
  async blocksToHTMLLossy(blocks: any[]): Promise<string> {
    const html = (list: any[]): string => list.map(b => {
      if (b.type !== 'paragraph' && b.type !== 'bulletListItem') throw new Error(`unknown block ${b.type}`)
      const kids = b.children?.length ? html(b.children) : ''
      return b.type === 'bulletListItem' ? `<ul><li><p>${text(b)}</p>${kids}</li></ul>` : `<p>${text(b)}</p>${kids}`
    }).join('')
    return html(blocks)
  },
}

const api: any = {
  notes: { get: vi.fn(async (id: string) => ({ id, type: id === 'mm' ? 'mindmap' : 'markdown' })) },
  mindmaps: { getNodes: vi.fn(async () => []) },
}

const para = (t: string, children: any[] = []) => ({ type: 'paragraph', content: [{ type: 'text', text: t }], children })
const bullet = (t: string, children: any[] = []) => ({ type: 'bulletListItem', content: [{ type: 'text', text: t }], children })

describe('exportBlocksToMarkdown', () => {
  it('renders embeds nested under list items, indented with them', async () => {
    const blocks = [
      para('Intro'),
      bullet('Point', [{ type: 'noteEmbed', props: { noteId: 'n1', noteTitle: 'Linked' }, children: [] }]),
      para('Outro'),
    ]
    const { markdown } = await exportBlocksToMarkdown(editor, blocks, api)
    expect(markdown).toContain('Intro')
    expect(markdown).toContain('* Point')
    expect(markdown).toContain('    > 📝 **Linked**')
    expect(markdown).toContain('Outro')
    expect(markdown).not.toMatch(/BANJUANEMBED/)
  })

  it('keeps the blocks around a top-level embed and their order', async () => {
    const blocks = [
      para('Before'),
      { type: 'annotationEmbed', props: { docTitle: 'Book', page: 3, quote: 'q', comment: 'c' }, children: [] },
      para('After'),
    ]
    const { markdown } = await exportBlocksToMarkdown(editor, blocks, api)
    // The page label is in the UI's language (here the default one).
    const i = markdown.indexOf('Before'), j = markdown.indexOf(`> 📄 Book · ${translate('embed.pageShort', 3)}`), k = markdown.indexOf('After')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(j).toBeGreaterThan(i)
    expect(k).toBeGreaterThan(j)
    expect(markdown).toContain('> "q"\n> c')
  })

  it('collects mindmap images, also from nested embeds', async () => {
    const blocks = [bullet('Map', [{ type: 'noteEmbed', props: { noteId: 'mm', noteTitle: 'A/B' }, children: [] }])]
    const { markdown, files } = await exportBlocksToMarkdown(editor, blocks, api)
    expect(files).toEqual([{ name: 'A_B-1.png', dataUrl: 'data:image/png;base64,AAAA' }])
    expect(markdown).toContain('    ![A/B](images/A_B-1.png)')
  })

  it('keeps an embed\'s own children', async () => {
    const blocks = [{ type: 'mermaidBlock', props: { code: 'graph TD' }, children: [para('child')] }]
    const { markdown } = await exportBlocksToMarkdown(editor, blocks, api)
    expect(markdown).toContain('```mermaid\ngraph TD\n```')
    expect(markdown).toContain('    child')
  })
})

describe('exportBlocksToHTML', () => {
  it('renders nested embeds inside the list item and escapes text', async () => {
    const blocks = [bullet('Point', [{ type: 'annotationEmbed', props: { docTitle: 'A <b>', quote: 'x < y' }, children: [] }])]
    const html = await exportBlocksToHTML(editor, blocks, api)
    expect(html).toBe('<ul><li><p>Point</p><blockquote><p>📄 A &lt;b&gt;</p><p><em>"x &lt; y"</em></p></blockquote></li></ul>')
  })
})
