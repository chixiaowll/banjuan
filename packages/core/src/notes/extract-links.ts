export interface ExtractedNoteLink {
  targetId: string
  /** Set (with empty targetId) for markdown-imported links that carry only a
   * title — the caller resolves it against the notes table, mirroring the
   * title-based matching used by click-to-open. */
  targetTitle?: string
  context: string
}

export function extractNoteLinks(blocks: unknown[]): ExtractedNoteLink[] {
  const links: ExtractedNoteLink[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'noteLink') {
      const props = (n.props ?? {}) as { noteId?: string; title?: string }
      const content = Array.isArray(n.content)
        ? n.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      const context = content || props.title || ''
      if (props.noteId) links.push({ targetId: props.noteId, context })
      else if (props.title) links.push({ targetId: '', targetTitle: props.title, context })
    }
    if (n.type === 'noteEmbed') {
      const props = (n.props ?? {}) as { noteId?: string; noteTitle?: string }
      if (props.noteId) links.push({ targetId: props.noteId, context: props.noteTitle || '' })
      else if (props.noteTitle) links.push({ targetId: '', targetTitle: props.noteTitle, context: props.noteTitle })
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  blocks.forEach(walk)
  return links
}

/** Resolve title-only entries to ids (first note wins on duplicate titles, same
 * as click-to-open), drop unresolved/self links, dedupe by target. */
export function resolveNoteLinks(
  links: ExtractedNoteLink[],
  sourceId: string,
  titleToId: (title: string) => string | undefined,
): Array<{ targetId: string; context: string }> {
  const seen = new Set<string>()
  const out: Array<{ targetId: string; context: string }> = []
  for (const l of links) {
    const id = l.targetId || (l.targetTitle ? titleToId(l.targetTitle) ?? '' : '')
    if (!id || id === sourceId || seen.has(id)) continue
    seen.add(id)
    out.push({ targetId: id, context: l.context })
  }
  return out
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
