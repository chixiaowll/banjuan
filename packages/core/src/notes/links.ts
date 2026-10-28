/**
 * `banjuan://` links to what a library holds — for AI answers that cite their
 * sources, and for note links / embeds written out as Markdown:
 *
 *   banjuan://doc/<id>?page=12                     a document (at a page)
 *   banjuan://annotation/<id>?doc=<docId>&page=3   an annotation
 *   banjuan://note/<id>                            a note
 *
 * Any of them may carry `library=<path>`. Other query values pass through.
 */

export type LinkKind = 'doc' | 'annotation' | 'note'

export interface ParsedLink {
  kind: LinkKind
  id: string
  query: Record<string, string>
}

const LINK = /^banjuan:\/\/(doc|annotation|note)\/([A-Za-z0-9-]{1,64})\/?(?:\?(.*))?$/

export function formatLink(kind: LinkKind, id: string, query: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
  const qs = params.toString()
  return `banjuan://${kind}/${id}${qs ? '?' + qs : ''}`
}

export function parseLink(url: string): ParsedLink | null {
  const m = LINK.exec(url.trim())
  if (!m) return null
  return { kind: m[1] as LinkKind, id: m[2], query: Object.fromEntries(new URLSearchParams(m[3] ?? '')) }
}

/** The link's page: a whole number from 1 up, else undefined. */
export function linkPage(query: Record<string, string | undefined>): number | undefined {
  const p = query.page
  return p && /^[1-9]\d*$/.test(p) ? Number(p) : undefined
}
