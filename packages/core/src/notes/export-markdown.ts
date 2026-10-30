import { formatLink } from './links.js'

const ATTACHMENT_PREFIX = 'banjuan-attachment://'

export interface MarkdownOptions {
  /**
   * For AI tools, which write the Markdown back: note / document links and
   * embeds as banjuan:// links, so markdownToBlocks restores them with their
   * ids. Off for files exported to other apps ([[Title]] wiki-links).
   */
  banjuanLinks?: boolean
}

export function blocksToMarkdown(blocks: unknown[], opts: MarkdownOptions = {}): string {
  const lines: string[] = []
  for (const block of blocks) {
    lines.push(blockToMd(block as Record<string, unknown>, opts))
  }
  return lines.join('\n\n')
}

/** Link text with its brackets escaped (titles like "[3] Notes"). */
const linkText = (s: string) => s.replace(/[\\[\]]/g, m => '\\' + m)
const quoted = (lines: string) => lines.split('\n').map(l => '> ' + l)

export function collectAttachmentPaths(blocks: unknown[]): string[] {
  const paths: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'image' && typeof (n.props as any)?.url === 'string') {
      const url = (n.props as any).url as string
      if (url.startsWith(ATTACHMENT_PREFIX)) {
        paths.push(url.slice(ATTACHMENT_PREFIX.length))
      }
    }
    if (n.type === 'fileEmbed' && (n.props as any)?.src) {
      paths.push((n.props as any).src)
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  blocks.forEach(walk)
  return paths
}

function blockToMd(block: Record<string, unknown>, opts: MarkdownOptions = {}): string {
  const type = block.type as string
  const props = (block.props ?? {}) as Record<string, unknown>
  const text = inlineToMd(block.content, opts)
  const children = Array.isArray(block.children)
    // Every line of a child one level in (a grandchild then sits two levels in).
    ? (block.children as any[]).map(c => blockToMd(c, opts)).filter(Boolean).map(l => l.split('\n').map(x => '    ' + x).join('\n')).join('\n\n')
    : ''

  let result = ''

  switch (type) {
    case 'paragraph':
      result = text
      break
    case 'quote':
      result = text.split('\n').map(l => '> ' + l).join('\n')
      break
    case 'heading': {
      const level = Math.min(Math.max(Number(props.level) || 1, 1), 6)
      result = '#'.repeat(level) + ' ' + text
      break
    }
    case 'bulletListItem':
      result = '- ' + text
      break
    case 'numberedListItem':
      result = '1. ' + text
      break
    case 'checkListItem':
      result = (props.checked ? '- [x] ' : '- [ ] ') + text
      break
    case 'codeBlock':
      result = '```' + (props.language || '') + '\n' + text + '\n```'
      break
    case 'table':
      result = tableToMd(block, opts)
      break
    case 'image': {
      const url = props.url as string ?? ''
      const caption = props.caption as string ?? ''
      if (url.startsWith(ATTACHMENT_PREFIX)) {
        const relPath = url.slice(ATTACHMENT_PREFIX.length)
        const fileName = relPath.split('/').pop() ?? relPath
        result = `![${caption || fileName}](attachments/${fileName})`
      } else {
        result = `![${caption}](${url})`
      }
      break
    }
    case 'video': {
      const url = props.url as string ?? ''
      result = `[Video](${url})`
      break
    }
    case 'audio': {
      const url = props.url as string ?? ''
      result = `[Audio](${url})`
      break
    }
    case 'file': {
      const url = props.url as string ?? ''
      const name = props.name as string ?? 'file'
      result = `[${name}](${url})`
      break
    }
    case 'fileEmbed': {
      const src = props.src as string ?? ''
      const fileName = props.fileName as string ?? src.split('/').pop() ?? 'attachment'
      result = `[${fileName}](attachments/${fileName})`
      break
    }
    case 'noteEmbed': {
      if (opts.banjuanLinks && props.noteId) {
        result = `> [📝 ${linkText(String(props.noteTitle ?? ''))}](${formatLink('note', String(props.noteId), { embed: 1, pageIndex: String(props.pageIndex ?? '') })})`
        break
      }
      const noteTitle = props.noteTitle as string ?? 'Note'
      result = `> 📝 ${noteTitle}`
      break
    }
    case 'documentEmbed': {
      result = opts.banjuanLinks && props.docId
        ? `> [📘 ${linkText(String(props.docTitle ?? ''))}](${formatLink('doc', String(props.docId), { embed: 1, authors: String(props.authors ?? ''), pageCount: Number(props.pageCount) || undefined })})`
        : text
      break
    }
    case 'annotationEmbed': {
      if (opts.banjuanLinks && props.docId) {
        // Its source as a link (the annotation, or the document page), then
        // "the quoted text" and the comment — markdownToBlocks reads it back.
        const page = Number(props.page) || undefined
        const href = props.annotationId
          ? formatLink('annotation', String(props.annotationId), { doc: String(props.docId), page })
          : formatLink('doc', String(props.docId), { page })
        const lines = [`> [📄 ${linkText(String(props.docTitle ?? ''))}${page ? ` p.${page}` : ''}](${href})`]
        if (props.quote) lines.push(...quoted(`"${props.quote as string}"`))
        if (props.comment) lines.push(...quoted(props.comment as string))
        result = lines.join('\n')
        break
      }
      // Props are quote / comment / docTitle / page (the old selectedText /
      // content names never existed on this block, so exports came out empty).
      const page = Number(props.page) || 0
      const lines = [`> 📄 ${(props.docTitle as string) || 'Document'}${page ? ` p.${page}` : ''}`]
      if (props.quote) lines.push(`> "${props.quote as string}"`)
      if (props.comment) lines.push(`> ${props.comment as string}`)
      result = lines.join('\n')
      break
    }
    default:
      result = text
  }

  if (children) {
    result += '\n' + children
  }
  return result
}

function inlineToMd(content: unknown, opts: MarkdownOptions = {}): string {
  if (!Array.isArray(content)) return ''
  return content.map(item => {
    if (typeof item === 'string') return item
    if (!item || typeof item !== 'object') return ''
    const node = item as Record<string, unknown>
    if (node.type === 'text') {
      let t = (node.text as string) ?? ''
      const styles = (node.styles ?? {}) as Record<string, unknown>
      if (styles.bold) t = `**${t}**`
      if (styles.italic) t = `*${t}*`
      if (styles.strikethrough) t = `~~${t}~~`
      if (styles.code) t = '`' + t + '`'
      return t
    }
    if (node.type === 'link') {
      const href = (node.href as string) ?? ''
      return `[${inlineToMd(node.content, opts)}](${href})`
    }
    if (node.type === 'noteLink' || node.type === 'documentLink') {
      // Atomic reference chips carry their label in props.title; older stored
      // notes kept it as editable inline content. Prefer the prop, fall back.
      const props = (node.props ?? {}) as Record<string, unknown>
      const title = (props.title as string) || inlineToMd(node.content, opts)
      const id = (node.type === 'noteLink' ? props.noteId : props.docId) as string | undefined
      if (opts.banjuanLinks && id) return `[${linkText(title)}](${formatLink(node.type === 'noteLink' ? 'note' : 'doc', id)})`
      return `[[${title}]]`
    }
    return inlineToMd(node.content, opts)
  }).join('')
}

function tableToMd(block: Record<string, unknown>, opts: MarkdownOptions = {}): string {
  const content = block.content as Record<string, unknown> | undefined
  const rows = (content?.rows ?? []) as any[]
  if (rows.length === 0) return ''

  const mdRows: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i].cells ?? []) as any[][]
    const cellTexts = cells.map((cell: any[]) => inlineToMd(cell, opts))
    mdRows.push('| ' + cellTexts.join(' | ') + ' |')
    if (i === 0) {
      mdRows.push('| ' + cellTexts.map(() => '---').join(' | ') + ' |')
    }
  }
  return mdRows.join('\n')
}
