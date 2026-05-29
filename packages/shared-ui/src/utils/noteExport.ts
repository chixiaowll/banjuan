import type { BanjuanAPI } from '../api.js'
import { renderStroke } from '../components/handwriting/renderStrokes.js'
import { renderMindmapToImage } from '../components/MindmapExportService.js'

const ATTACHMENT_PREFIX = 'banjuan-attachment://'

export function extractExportAttachmentPaths(blocks: any[]): string[] {
  const paths: string[] = []
  const walk = (node: any) => {
    if (!node) return
    if (node.type === 'image' && typeof node.props?.url === 'string' && node.props.url.startsWith(ATTACHMENT_PREFIX)) {
      paths.push(node.props.url.slice(ATTACHMENT_PREFIX.length))
    }
    if (node.type === 'fileEmbed' && node.props?.src) {
      paths.push(node.props.src)
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  blocks.forEach(walk)
  return paths
}

function buildMindmapTree(nodes: any[]): { root: any | null; childrenMap: Map<string, any[]> } {
  const childrenMap = new Map<string, any[]>()
  let root: any = null
  for (const n of nodes) {
    if (!n.parentId) root = n
    else {
      const siblings = childrenMap.get(n.parentId) ?? []
      siblings.push(n)
      childrenMap.set(n.parentId, siblings)
    }
  }
  for (const children of childrenMap.values()) {
    children.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }
  return { root, childrenMap }
}

export function renderMindmapTreeMd(title: string, nodes: any[]): string {
  const { root, childrenMap } = buildMindmapTree(nodes)
  if (!root) return `> 🧠 **${title}**`
  const lines = [`🧠 **${title}**`, '']
  const walk = (nodeId: string, depth: number) => {
    const children = childrenMap.get(nodeId) ?? []
    for (const child of children) {
      lines.push(`${'  '.repeat(depth)}- ${child.title || 'Untitled'}`)
      walk(child.id, depth + 1)
    }
  }
  lines.push(`- ${root.title || title}`)
  walk(root.id, 1)
  return lines.join('\n')
}

export function renderMindmapTreeHtml(title: string, nodes: any[]): string {
  const { root, childrenMap } = buildMindmapTree(nodes)
  if (!root) return `<blockquote><p>🧠 <strong>${title}</strong></p></blockquote>`
  const renderList = (nodeId: string): string => {
    const children = childrenMap.get(nodeId) ?? []
    if (children.length === 0) return ''
    const items = children.map(c =>
      `<li>${c.title || 'Untitled'}${renderList(c.id)}</li>`
    ).join('')
    return `<ul>${items}</ul>`
  }
  return `<div class="mindmap-export"><p>🧠 <strong>${title}</strong></p><ul><li>${root.title || title}${renderList(root.id)}</li></ul></div>`
}

export async function screenshotMindmapEmbed(noteId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)
    const detail = {
      noteId,
      resolve: (result: string | null) => {
        clearTimeout(timeout)
        resolve(result)
      },
    }
    document.dispatchEvent(new CustomEvent('mindmap-screenshot-request', { detail }))
  })
}

/**
 * Decode an image data URL to something canvas can draw. Uses createImageBitmap
 * (decodes immediately, independent of window visibility) so it works in the
 * hidden background export window, where an <img>'s onload/decode may stall.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const meta = dataUrl.slice(5, comma)
  const mime = meta.split(';')[0] || 'image/png'
  const b64 = dataUrl.slice(comma + 1)
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

async function decodeImage(dataUrl: string): Promise<CanvasImageSource> {
  // Manual base64 -> Blob -> bitmap: decodes immediately and headlessly,
  // avoiding both fetch/CSP issues and the hidden window's stalled <img> decode.
  try {
    return await createImageBitmap(dataUrlToBlob(dataUrl))
  } catch {
    const el = new Image()
    el.src = dataUrl
    try { await el.decode() } catch { await new Promise<void>((res, rej) => { el.onload = () => res(); el.onerror = rej }) }
    return el
  }
}

/** Draw a handwriting page's imported images (background), then its strokes on top — matching the live editor's render order. */
async function drawHandwritingPage(ctx: CanvasRenderingContext2D, page: any, pageSize: { width: number; height: number }) {
  const images: any[] = page?.snapshot?.images ?? []
  for (const img of images) {
    if (!img?.dataUrl) continue
    try {
      const drawable = await decodeImage(img.dataUrl)
      ctx.save()
      ctx.translate(img.x + img.width / 2, img.y + img.height / 2)
      ctx.rotate(img.rotation ?? 0)
      ctx.drawImage(drawable, -img.width / 2, -img.height / 2, img.width, img.height)
      ctx.restore()
    } catch { /* skip unloadable image */ }
  }
  // Draw strokes on top WITHOUT clearing — renderAllStrokes() starts with
  // clearRect, which would wipe the images we just drew.
  for (const stroke of (page?.snapshot?.strokes ?? [])) {
    renderStroke(ctx, stroke)
  }
}

export async function screenshotHandwritingEmbed(api: BanjuanAPI, noteId: string, pageIndex?: number): Promise<string | null> {
  try {
    const note = await api.notes.get(noteId)
    if (!note || note.type !== 'handwriting') return null
    const parsed = JSON.parse(note.content)
    const pages = parsed.pages ?? []
    if (pages.length === 0) return null
    const pi = pageIndex != null && pageIndex >= 0 && pageIndex < pages.length ? pageIndex : 0
    const page = pages[pi]
    const typeMeta = note.typeMeta ?? {}
    const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = pageSize.width * dpr
    canvas.height = pageSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    await drawHandwritingPage(ctx, page, pageSize)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

async function renderHandwritingPages(note: any): Promise<string[]> {
  const parsed = JSON.parse(note.content)
  const pages = parsed.pages ?? []
  if (pages.length === 0) return []
  const typeMeta = note.typeMeta ?? {}
  const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
  const dpr = 2
  const dataUrls: string[] = []
  for (const page of pages) {
    const canvas = document.createElement('canvas')
    canvas.width = pageSize.width * dpr
    canvas.height = pageSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    await drawHandwritingPage(ctx, page, pageSize)
    dataUrls.push(canvas.toDataURL('image/png'))
  }
  return dataUrls
}

// ---------------------------------------------------------------------------
// Standalone note export (mindmap / handwriting)
// ---------------------------------------------------------------------------

export async function exportMindmapToMarkdown(api: BanjuanAPI, noteId: string, title: string): Promise<string> {
  const nodes = await api.mindmaps.getNodes(noteId)
  return renderMindmapTreeMd(title, nodes)
}

export async function exportMindmapToHTML(api: BanjuanAPI, noteId: string, title: string): Promise<string> {
  const nodes = await api.mindmaps.getNodes(noteId)
  return renderMindmapTreeHtml(title, nodes)
}

export async function exportHandwritingToMarkdown(api: BanjuanAPI, noteId: string, title: string): Promise<string> {
  const note = await api.notes.get(noteId)
  if (!note) return ''
  const dataUrls = await renderHandwritingPages(note)
  if (dataUrls.length === 0) return `> ✏️ **${title}**`
  return dataUrls.map((url, i) =>
    `![${title}${dataUrls.length > 1 ? ` - ${i + 1}` : ''}](${url})`
  ).join('\n\n')
}

export async function exportHandwritingToFiles(api: BanjuanAPI, noteId: string, title: string): Promise<{ markdown: string; attachments: string[]; files: Array<{ name: string; dataUrl: string }> }> {
  const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_')
  const note = await api.notes.get(noteId)
  if (!note) return { markdown: `> ✏️ **${title}**`, attachments: [], files: [] }
  const dataUrls = await renderHandwritingPages(note)
  if (dataUrls.length === 0) return { markdown: `> ✏️ **${title}**`, attachments: [], files: [] }
  const files = dataUrls.map((dataUrl, i) => ({
    name: dataUrls.length > 1 ? `${safeTitle}-${i + 1}.png` : `${safeTitle}.png`,
    dataUrl,
  }))
  const markdown = files.map((f, i) =>
    `![${title}${dataUrls.length > 1 ? ` - ${i + 1}` : ''}](images/${f.name})`
  ).join('\n\n')
  return { markdown, attachments: [], files }
}

export async function exportHandwritingToHTML(api: BanjuanAPI, noteId: string, title: string): Promise<string> {
  const note = await api.notes.get(noteId)
  if (!note) return ''
  const dataUrls = await renderHandwritingPages(note)
  if (dataUrls.length === 0) return `<blockquote><p>✏️ <strong>${title}</strong></p></blockquote>`
  return dataUrls.map(url =>
    `<div class="handwriting-export"><img src="${url}" style="max-width:100%" /></div>`
  ).join('\n')
}

// ---------------------------------------------------------------------------
// Block-based note export (markdown notes)
// ---------------------------------------------------------------------------

export async function exportBlocksToMarkdown(editor: any, blocks: any[], api: BanjuanAPI): Promise<{ markdown: string; files: Array<{ name: string; dataUrl: string }> }> {
  const segments: string[] = []
  const files: Array<{ name: string; dataUrl: string }> = []
  let stdBatch: any[] = []
  let imgCounter = 0

  const flushStd = async () => {
    if (stdBatch.length === 0) return
    try {
      let md = await editor.blocksToMarkdownLossy(stdBatch)
      md = md.replace(/!\[[^\]]*\]\(banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)\)/g,
        (_match: string, fileName: string) => `![${decodeURIComponent(fileName)}](attachments/${fileName})`)
      md = md.replace(/banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)/g, 'attachments/$1')
      segments.push(md)
    } catch { /* skip */ }
    stdBatch = []
  }

  for (const block of blocks) {
    const p = block.props || {}
    if (block.type === 'mermaidBlock' && p.code) {
      await flushStd()
      segments.push(`\`\`\`mermaid\n${p.code}\n\`\`\``)
    } else if (block.type === 'noteEmbed') {
      await flushStd()
      const noteTitle = p.noteTitle || 'Untitled'
      const safeNoteTitle = noteTitle.replace(/[/\\:*?"<>|]/g, '_')
      if (p.noteId) {
        try {
          const note = await api.notes.get(p.noteId)
          if (note?.type === 'mindmap') {
            const imgDataUrl = await renderMindmapToImage(p.noteId)
            if (imgDataUrl) {
              const imgName = `${safeNoteTitle}-${++imgCounter}.png`
              files.push({ name: imgName, dataUrl: imgDataUrl })
              segments.push(`🧠 **${noteTitle}**\n\n![${noteTitle}](images/${imgName})`)
            } else {
              const nodes = await api.mindmaps.getNodes(p.noteId)
              segments.push(renderMindmapTreeMd(noteTitle, nodes))
            }
          } else if (note?.type === 'handwriting') {
            const pi = p.pageIndex !== '' && p.pageIndex != null ? parseInt(p.pageIndex, 10) : undefined
            const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pi)
            if (imgDataUrl) {
              const imgName = `${safeNoteTitle}-${++imgCounter}.png`
              files.push({ name: imgName, dataUrl: imgDataUrl })
              segments.push(`✏️ **${noteTitle}**\n\n![${noteTitle}](images/${imgName})`)
            } else {
              segments.push(`> ✏️ **${noteTitle}**`)
            }
          } else {
            segments.push(`> 📝 **${noteTitle}**`)
          }
        } catch {
          segments.push(`> 📝 **${noteTitle}**`)
        }
      } else {
        segments.push(`> 📝 **${noteTitle}**`)
      }
    } else if (block.type === 'documentEmbed') {
      await flushStd()
      const parts = [`📄 **${p.docTitle || 'Document'}**`]
      if (p.authors) parts.push(p.authors)
      if (p.pageCount > 0) parts.push(`${p.pageCount} pages`)
      segments.push(`> ${parts.join(' · ')}`)
    } else if (block.type === 'annotationEmbed') {
      await flushStd()
      const lines = [`> 📄 ${p.docTitle || 'Document'}${p.page ? ` p.${p.page}` : ''}`]
      if (p.quote) lines.push(`> "${p.quote}"`)
      if (p.comment) lines.push(`> ${p.comment}`)
      segments.push(lines.join('\n'))
    } else if (block.type === 'fileEmbed' && p.src) {
      await flushStd()
      const fileName = p.fileName || p.src.split('/').pop() || 'attachment'
      const safeName = p.src.split('/').pop() || fileName
      segments.push(`[${fileName}](attachments/${safeName})`)
    } else {
      stdBatch.push(block)
    }
  }
  await flushStd()

  return { markdown: segments.join('\n\n'), files }
}

export async function exportBlocksToHTML(editor: any, blocks: any[], api: BanjuanAPI): Promise<string> {
  const segments: string[] = []
  let stdBatch: any[] = []

  const flushStd = async () => {
    if (stdBatch.length === 0) return
    try {
      segments.push(await editor.blocksToHTMLLossy(stdBatch))
    } catch { /* skip */ }
    stdBatch = []
  }

  for (const block of blocks) {
    const p = block.props || {}
    if (block.type === 'mermaidBlock' && p.code) {
      await flushStd()
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: (p.theme as any) || 'neutral' })
        const id = `mermaid-export-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const w = p.renderWidth || 500
        const tempDiv = document.createElement('div')
        tempDiv.style.width = `${w}px`
        tempDiv.style.position = 'absolute'
        tempDiv.style.left = '-9999px'
        document.body.appendChild(tempDiv)
        const { svg } = await mermaid.render(id, p.code, tempDiv)
        document.body.removeChild(tempDiv)
        segments.push(`<div class="mermaid-diagram">${svg}</div>`)
      } catch {
        segments.push(`<pre><code class="language-mermaid">${p.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
      }
    } else if (block.type === 'noteEmbed') {
      await flushStd()
      const noteTitle = p.noteTitle || 'Untitled'
      if (p.noteId) {
        try {
          const note = await api.notes.get(p.noteId)
          if (note?.type === 'mindmap') {
            const imgDataUrl = await renderMindmapToImage(p.noteId)
            if (imgDataUrl) {
              segments.push(`<div class="mindmap-export"><p>🧠 <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`)
            } else {
              const nodes = await api.mindmaps.getNodes(p.noteId)
              segments.push(renderMindmapTreeHtml(noteTitle, nodes))
            }
          } else if (note?.type === 'handwriting') {
            const pi = p.pageIndex !== '' && p.pageIndex != null ? parseInt(p.pageIndex, 10) : undefined
            const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pi)
            if (imgDataUrl) {
              segments.push(`<div class="handwriting-export"><p>✏️ <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`)
            } else {
              segments.push(`<blockquote><p>✏️ <strong>${noteTitle}</strong></p></blockquote>`)
            }
          } else {
            segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
          }
        } catch {
          segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
        }
      } else {
        segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
      }
    } else if (block.type === 'documentEmbed') {
      await flushStd()
      const parts = [`📄 <strong>${p.docTitle || 'Document'}</strong>`]
      if (p.authors) parts.push(p.authors)
      if (p.pageCount > 0) parts.push(`${p.pageCount} pages`)
      segments.push(`<blockquote><p>${parts.join(' · ')}</p></blockquote>`)
    } else if (block.type === 'annotationEmbed') {
      await flushStd()
      let inner = `<p>📄 ${p.docTitle || 'Document'}${p.page ? ` p.${p.page}` : ''}</p>`
      if (p.quote) inner += `<p><em>"${p.quote}"</em></p>`
      if (p.comment) inner += `<p>${p.comment}</p>`
      segments.push(`<blockquote>${inner}</blockquote>`)
    } else if (block.type === 'fileEmbed' && p.src) {
      await flushStd()
      const fileName = p.fileName || p.src.split('/').pop() || 'attachment'
      segments.push(`<p>📎 <strong>${fileName}</strong></p>`)
    } else {
      stdBatch.push(block)
    }
  }
  await flushStd()
  return segments.join('\n')
}
