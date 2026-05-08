export function parseTextToBlocks(text: string): any[] {
  const lines = text.split('\n')
  const blocks: any[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) continue

    const hm = line.match(/^(#{1,6})\s+(.+)/)
    if (hm) {
      blocks.push({ type: 'heading', props: { level: Math.min(hm[1].length, 3) }, content: parseInline(hm[2]), children: [] })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push({ type: 'bulletListItem', content: parseInline(line.replace(/^[-*]\s+/, '')), children: [] })
      continue
    }

    const nm = line.match(/^\d+[.)]\s+(.+)/)
    if (nm) {
      blocks.push({ type: 'numberedListItem', content: parseInline(nm[1]), children: [] })
      continue
    }

    if (line.startsWith('> ')) {
      blocks.push({ type: 'paragraph', content: parseInline(line.slice(2)), children: [] })
      continue
    }

    blocks.push({ type: 'paragraph', content: parseInline(line), children: [] })
  }
  return blocks
}

function parseInline(text: string): any[] {
  const result: any[] = []
  const re = /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[2] || m[3]) {
      result.push({ type: 'text', text: m[2] || m[3], styles: { bold: true } })
    } else if (m[4]) {
      result.push({ type: 'text', text: m[4], styles: { code: true } })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last) })
  if (result.length === 0) result.push({ type: 'text', text })
  return result
}

function extractText(content: any[]): string {
  return (content ?? []).map((c: any) => c.text ?? '').join('')
}

const MD_PATTERN = /^#{1,6}\s|^\*\*|^[-*]\s+|^\d+[.)]\s/

export function migrateRawMarkdownBlocks(blocks: any[]): any[] {
  const allParagraphs = blocks.every((b: any) => b.type === 'paragraph')
  if (!allParagraphs) return blocks

  const hasMarkdown = blocks.some((b: any) => MD_PATTERN.test(extractText(b.content)))
  if (!hasMarkdown) return blocks

  const text = blocks.map((b: any) => extractText(b.content)).join('\n')
  return parseTextToBlocks(text)
}
