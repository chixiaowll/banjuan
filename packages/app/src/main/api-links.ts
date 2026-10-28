import { formatLink } from '@banjuan/core'

/**
 * banjuan:// links added to API results, so an AI tool can cite what it read
 * and the user can click through to it in Banjuan (deep-link.ts).
 */

type Hit = { type: string; id: string; page?: number | null; docId?: string }

export function withSearchLinks<T extends Hit>(results: T[], library: string): Array<T & { link?: string }> {
  return results.map(r => {
    const page = r.page ?? undefined
    if (r.type === 'document') return { ...r, link: formatLink('doc', r.id, { page, library }) }
    if (r.type === 'annotation') return { ...r, link: formatLink('annotation', r.id, { doc: r.docId, page, library }) }
    if (r.type === 'note') return { ...r, link: formatLink('note', r.id, { library }) }
    return r
  })
}

export function withPageLinks<P extends { page: number }, T extends { pages: P[] }>(result: T, docId: string, library: string): Omit<T, 'pages'> & { pages: Array<P & { link: string }> } {
  return { ...result, pages: result.pages.map(p => ({ ...p, link: formatLink('doc', docId, { page: p.page, library }) })) }
}

export function withAnnotationLinks<T extends { id: string; docId: string; page: number | null }>(annotations: T[], library: string): Array<T & { link: string }> {
  return annotations.map(a => ({ ...a, link: formatLink('annotation', a.id, { doc: a.docId, page: a.page ?? undefined, library }) }))
}
