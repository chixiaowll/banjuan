import type { BanjuanAPI } from '../api.js'
import { renderStroke } from '../components/handwriting/renderStrokes.js'
import { renderMindmapToImage } from '../components/MindmapExportService.js'
import { translate } from '../i18n/index.js'

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
      lines.push(`${'  '.repeat(depth)}- ${child.title || translate('note.untitled')}`)
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
      `<li>${escapeHtml(c.title || translate('note.untitled'))}${renderList(c.id)}</li>`
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

/** One handwriting page — images, then strokes — as a data URL, or null. */
export async function handwritingPageDataUrl(page: any, pageSize: { width: number; height: number }, format: 'png' | 'jpeg' = 'png'): Promise<string | null> {
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
  const url = canvas.toDataURL(`image/${format}`)
  canvas.width = canvas.height = 0
  return url
}

async function renderHandwritingPages(note: any): Promise<string[]> {
  const parsed = JSON.parse(note.content)
  const pages = parsed.pages ?? []
  if (pages.length === 0) return []
  const typeMeta = note.typeMeta ?? {}
  const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
  const dataUrls: string[] = []
  for (const page of pages) {
    const url = await handwritingPageDataUrl(page, pageSize)
    if (url) dataUrls.push(url)
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

/** Our own block types, which BlockNote's serializers don't understand. */
const CUSTOM_BLOCKS = new Set(['mermaidBlock', 'noteEmbed', 'documentEmbed', 'annotationEmbed', 'fileEmbed'])

/**
 * Replace every custom block — at any depth, e.g. a note embed indented under a
 * list item — with a paragraph holding a unique token. The whole document then
 * goes through BlockNote's serializer in one call (keeping list nesting), and
 * each token is swapped for the custom block's own rendering. Custom blocks used
 * to be handled only at the top level; nested ones reached the serializer,
 * which could throw and take the surrounding blocks down with it.
 */
function swapCustomBlocks(blocks: any[]): { blocks: any[]; custom: Array<{ token: string; block: any }> } {
  const custom: Array<{ token: string; block: any }> = []
  const nonce = Math.random().toString(36).slice(2, 8).toUpperCase()
  const swap = (list: any[]): any[] => list.map(b => {
    const children = Array.isArray(b?.children) && b.children.length ? swap(b.children) : b?.children
    if (b && CUSTOM_BLOCKS.has(b.type)) {
      const token = `BANJUANEMBED${custom.length}X${nonce}`
      custom.push({ token, block: b })
      return { type: 'paragraph', content: token, children: children ?? [] }
    }
    return children === b?.children ? b : { ...b, children }
  })
  return { blocks: swap(blocks), custom }
}

const escapeHtml = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function pageIndexOf(p: any): number | undefined {
  return p.pageIndex !== '' && p.pageIndex != null ? parseInt(p.pageIndex, 10) : undefined
}

async function customBlockToMarkdown(
  block: any, api: BanjuanAPI, addImage: (title: string, dataUrl: string) => string,
): Promise<string> {
  const p = block.props || {}
  switch (block.type) {
    case 'mermaidBlock':
      return p.code ? `\`\`\`mermaid\n${p.code}\n\`\`\`` : ''
    case 'noteEmbed': {
      const noteTitle = p.noteTitle || translate('note.untitled')
      if (!p.noteId) return `> 📝 **${noteTitle}**`
      try {
        const note = await api.notes.get(p.noteId)
        if (note?.type === 'mindmap') {
          const imgDataUrl = await renderMindmapToImage(p.noteId)
          if (imgDataUrl) return `🧠 **${noteTitle}**\n\n![${noteTitle}](images/${addImage(noteTitle, imgDataUrl)})`
          return renderMindmapTreeMd(noteTitle, await api.mindmaps.getNodes(p.noteId))
        }
        if (note?.type === 'handwriting') {
          const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pageIndexOf(p))
          if (imgDataUrl) return `✏️ **${noteTitle}**\n\n![${noteTitle}](images/${addImage(noteTitle, imgDataUrl)})`
          return `> ✏️ **${noteTitle}**`
        }
      } catch { /* fall through to the plain reference */ }
      return `> 📝 **${noteTitle}**`
    }
    case 'documentEmbed': {
      const parts = [`📄 **${p.docTitle || translate('embed.untitledDocument')}**`]
      if (p.authors) parts.push(p.authors)
      if (p.pageCount > 0) parts.push(translate('embed.pageCount', p.pageCount))
      return `> ${parts.join(' · ')}`
    }
    case 'annotationEmbed': {
      const lines = [`> 📄 ${p.docTitle || translate('embed.untitledDocument')}${p.page ? ` · ${translate('embed.pageShort', p.page)}` : ''}`]
      if (p.quote) lines.push(`> "${p.quote}"`)
      if (p.comment) lines.push(`> ${p.comment}`)
      return lines.join('\n')
    }
    case 'fileEmbed': {
      if (!p.src) return ''
      const fileName = p.fileName || p.src.split('/').pop() || 'attachment'
      const safeName = p.src.split('/').pop() || fileName
      return `[${fileName}](attachments/${safeName})`
    }
  }
  return ''
}

async function customBlockToHTML(block: any, api: BanjuanAPI): Promise<string> {
  const p = block.props || {}
  switch (block.type) {
    case 'mermaidBlock': {
      if (!p.code) return ''
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
        try {
          const { svg } = await mermaid.render(id, p.code, tempDiv)
          return `<div class="mermaid-diagram">${svg}</div>`
        } finally {
          tempDiv.remove()
        }
      } catch {
        return `<pre><code class="language-mermaid">${escapeHtml(p.code)}</code></pre>`
      }
    }
    case 'noteEmbed': {
      const noteTitle = escapeHtml(p.noteTitle || translate('note.untitled'))
      if (p.noteId) {
        try {
          const note = await api.notes.get(p.noteId)
          if (note?.type === 'mindmap') {
            const imgDataUrl = await renderMindmapToImage(p.noteId)
            if (imgDataUrl) return `<div class="mindmap-export"><p>🧠 <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`
            return renderMindmapTreeHtml(p.noteTitle || translate('note.untitled'), await api.mindmaps.getNodes(p.noteId))
          }
          if (note?.type === 'handwriting') {
            const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pageIndexOf(p))
            if (imgDataUrl) return `<div class="handwriting-export"><p>✏️ <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`
            return `<blockquote><p>✏️ <strong>${noteTitle}</strong></p></blockquote>`
          }
        } catch { /* fall through to the plain reference */ }
      }
      return `<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`
    }
    case 'documentEmbed': {
      const parts = [`📄 <strong>${escapeHtml(p.docTitle || translate('embed.untitledDocument'))}</strong>`]
      if (p.authors) parts.push(escapeHtml(p.authors))
      if (p.pageCount > 0) parts.push(translate('embed.pageCount', p.pageCount))
      return `<blockquote><p>${parts.join(' · ')}</p></blockquote>`
    }
    case 'annotationEmbed': {
      let inner = `<p>📄 ${escapeHtml(p.docTitle || translate('embed.untitledDocument'))}${p.page ? ` · ${escapeHtml(translate('embed.pageShort', p.page))}` : ''}</p>`
      if (p.quote) inner += `<p><em>"${escapeHtml(p.quote)}"</em></p>`
      if (p.comment) inner += `<p>${escapeHtml(p.comment)}</p>`
      return `<blockquote>${inner}</blockquote>`
    }
    case 'fileEmbed': {
      if (!p.src) return ''
      return `<p>📎 <strong>${escapeHtml(p.fileName || p.src.split('/').pop() || 'attachment')}</strong></p>`
    }
  }
  return ''
}

export async function exportBlocksToMarkdown(editor: any, blocks: any[], api: BanjuanAPI): Promise<{ markdown: string; files: Array<{ name: string; dataUrl: string }> }> {
  const files: Array<{ name: string; dataUrl: string }> = []
  let imgCounter = 0
  const addImage = (title: string, dataUrl: string) => {
    const name = `${title.replace(/[/\\:*?"<>|]/g, '_')}-${++imgCounter}.png`
    files.push({ name, dataUrl })
    return name
  }

  const { blocks: plain, custom } = swapCustomBlocks(blocks)
  let md: string = await editor.blocksToMarkdownLossy(plain)
  md = md.replace(/!\[[^\]]*\]\(banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)\)/g,
    (_match: string, fileName: string) => `![${decodeURIComponent(fileName)}](attachments/${fileName})`)
  md = md.replace(/banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)/g, 'attachments/$1')

  for (const { token, block } of custom) {
    const rendered = await customBlockToMarkdown(block, api, addImage)
    // Indent every line like the token's line, so an embed under a list item stays under it.
    md = md.replace(new RegExp(`^([ \\t]*)${token}[ \\t]*$`, 'm'),
      (_m: string, indent: string) => rendered.split('\n').map(l => (l ? indent + l : l)).join('\n'))
    md = md.split(token).join(rendered)
  }
  return { markdown: md, files }
}

export async function exportBlocksToHTML(editor: any, blocks: any[], api: BanjuanAPI): Promise<string> {
  const { blocks: plain, custom } = swapCustomBlocks(blocks)
  let html: string = await editor.blocksToHTMLLossy(plain)
  for (const { token, block } of custom) {
    const rendered = await customBlockToHTML(block, api)
    html = html.replace(new RegExp(`<p[^>]*>${token}</p>`), () => rendered)
    html = html.split(token).join(rendered)
  }
  return html
}
