export function extractNoteLinks(blocks: unknown[]): Array<{ targetId: string; context: string }> {
  const links: Array<{ targetId: string; context: string }> = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'noteLink' && (n.props as any)?.noteId) {
      const content = Array.isArray(n.content)
        ? n.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      links.push({ targetId: (n.props as any).noteId, context: content })
    }
    if (n.type === 'noteEmbed' && (n.props as any)?.noteId) {
      links.push({ targetId: (n.props as any).noteId, context: (n.props as any).noteTitle || '' })
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  blocks.forEach(walk)
  return links
}

export function extractDocumentLinks(blocks: unknown[]): Array<{ targetId: string; context: string }> {
  const links: Array<{ targetId: string; context: string }> = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'documentLink' && (n.props as any)?.docId) {
      const content = Array.isArray(n.content)
        ? n.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      links.push({ targetId: (n.props as any).docId, context: content })
    }
    if (n.type === 'documentEmbed' && (n.props as any)?.docId) {
      links.push({ targetId: (n.props as any).docId, context: (n.props as any).docTitle || '' })
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  blocks.forEach(walk)
  return links
}
