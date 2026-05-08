const ATTACHMENT_PREFIX = 'banjuan-attachment://'

export function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    lines.push(blockToMd(block as Record<string, unknown>))
  }
  return lines.join('\n\n')
}

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

function blockToMd(block: Record<string, unknown>): string {
  const type = block.type as string
  const props = (block.props ?? {}) as Record<string, unknown>
  const text = inlineToMd(block.content)
  const children = Array.isArray(block.children)
    ? (block.children as any[]).map(c => blockToMd(c)).filter(Boolean).map(l => '    ' + l).join('\n\n')
    : ''

  let result = ''

  switch (type) {
    case 'paragraph':
      result = text
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
      result = tableToMd(block)
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
      const noteTitle = props.noteTitle as string ?? 'Note'
      result = `> 📝 ${noteTitle}`
      break
    }
    case 'annotationEmbed': {
      const annText = props.selectedText as string ?? props.content as string ?? ''
      result = annText ? `> ${annText}` : ''
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

function inlineToMd(content: unknown): string {
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
      const linkText = inlineToMd(node.content)
      return `[${linkText}](${href})`
    }
    if (node.type === 'noteLink') {
      const linkText = inlineToMd(node.content)
      return `[[${linkText}]]`
    }
    return inlineToMd(node.content)
  }).join('')
}

function tableToMd(block: Record<string, unknown>): string {
  const content = block.content as Record<string, unknown> | undefined
  const rows = (content?.rows ?? []) as any[]
  if (rows.length === 0) return ''

  const mdRows: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i].cells ?? []) as any[][]
    const cellTexts = cells.map((cell: any[]) => inlineToMd(cell))
    mdRows.push('| ' + cellTexts.join(' | ') + ' |')
    if (i === 0) {
      mdRows.push('| ' + cellTexts.map(() => '---').join(' | ') + ' |')
    }
  }
  return mdRows.join('\n')
}
