import type { PlatformDatabase } from '../platform/index.js'
import type { SearchResult, SearchOptions } from '../types.js'
import { escapeLike, LIKE_ESCAPE } from '../db/like.js'

/**
 * How note text can be searched: 'trigram' — FTS index answers any substring of
 * 3+ characters (shorter terms scan); 'scan' — older SQLite without trigram,
 * every term is a substring scan of the index; 'none' — no FTS5, titles only.
 */
type FtsMode = 'trigram' | 'scan' | 'none'

const SNIPPET_BEFORE = 24
const SNIPPET_LENGTH = 110

/** Title hits dominate; then how often the terms occur in the body. */
function scoreOf(title: string, body: string, terms: string[]): number {
  const t = title.toLowerCase()
  const b = body.toLowerCase()
  const inTitle = terms.filter(x => t.includes(x)).length
  let score = inTitle === terms.length ? 100 : inTitle * 20
  if (t.trim() === terms.join(' ')) score += 50
  let hits = 0
  for (const x of terms) {
    for (let i = b.indexOf(x); i !== -1 && hits < 20; i = b.indexOf(x, i + x.length)) hits++
  }
  return score + hits
}

/** A single line of text around the earliest hit, with ellipses where cut. */
function makeSnippet(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  let at = -1
  for (const x of terms) {
    const i = lower.indexOf(x)
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return flat.length > SNIPPET_LENGTH ? flat.slice(0, SNIPPET_LENGTH) + '…' : flat
  const start = Math.max(0, at - SNIPPET_BEFORE)
  const end = Math.min(flat.length, start + SNIPPET_LENGTH)
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '')
}

const likeParam = (term: string) => `%${escapeLike(term)}%`

/**
 * The folding the app applies to extracted document text (normalizeText in
 * app/src/main/doc-text-extract.ts), applied to query terms so they compare:
 * full-width letters and digits, ligatures, Kangxi radicals.
 */
const NFKC_FOLD = /[\u2f00-\u2fdf\uf900-\ufaff\ufb00-\ufb06\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g
const foldSearchText = (text: string) => text.replace(NFKC_FOLD, ch => ch.normalize('NFKC'))

function ftsModeOf(db: PlatformDatabase, table: string): FtsMode {
  let sql: string | undefined
  try {
    sql = db.queryOne<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [table])?.sql
  } catch { /* no sqlite_master access — treat as no FTS */ }
  return !sql ? 'none' : /trigram/i.test(sql) ? 'trigram' : 'scan'
}

/**
 * WHERE clauses for "every term occurs in these columns": an FTS MATCH for the
 * terms the trigram index can answer (3+ characters), LIKE scans for the rest.
 */
function termFilter(table: string, columns: string[], terms: string[], mode: FtsMode): { where: string[]; params: unknown[]; ranked: boolean } {
  const where: string[] = []
  const params: unknown[] = []
  const indexed = mode === 'trigram' ? terms.filter(t => [...t].length >= 3) : []
  if (indexed.length > 0) {
    where.push(`${table} MATCH ?`)
    params.push(`{${columns.join(' ')}} : (${indexed.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ')})`)
  }
  for (const t of terms.filter(t => !indexed.includes(t))) {
    where.push(`(${columns.map(c => `${table}.${c} LIKE ? ${LIKE_ESCAPE}`).join(' OR ')})`)
    for (const _ of columns) params.push(likeParam(t))
  }
  return { where, params, ranked: indexed.length > 0 }
}

export class SearchService {
  private fts: FtsMode
  private docText: FtsMode

  constructor(private db: PlatformDatabase) {
    this.fts = ftsModeOf(db, 'search_index')
    this.docText = ftsModeOf(db, 'doc_text')
  }

  index(entry: { id: string; title: string; content: string; type: string }): void {
    if (this.fts === 'none') return
    this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
         VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [entry.title, entry.content, `${entry.type}:${entry.id}`],
    )
  }

  removeById(id: string): void {
    if (this.fts === 'none') return
    this.db.run("DELETE FROM search_index WHERE type LIKE '%:' || ?", [id])
  }

  /**
   * Substring search across notes (title, body, mind-map node text), documents
   * (title, file path, text — see DocTextService) and annotations (highlighted
   * text, comment). Terms are separated by whitespace and must all match (AND),
   * case-insensitively; they are always literal — no FTS / LIKE syntax leaks through.
   */
  async query(queryStr: string, options?: SearchOptions): Promise<SearchResult[]> {
    const terms = [...new Set(queryStr.trim().toLowerCase().split(/\s+/).filter(Boolean))]
    if (terms.length === 0) return []
    const limit = options?.limit ?? 50
    const want = (type: SearchResult['type']) => !options?.type || options.type === type
    const results: SearchResult[] = []
    if (want('note')) results.push(...this.searchNotes(terms, limit))
    if (want('document')) results.push(...this.searchDocuments(terms, limit))
    if (want('annotation')) results.push(...this.searchAnnotations(terms, limit))
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  private searchNotes(terms: string[], limit: number): SearchResult[] {
    const found = new Map<string, { score: number; snippet: string }>()
    const add = (id: string, score: number, snippet: string) => {
      const prev = found.get(id)
      if (!prev) found.set(id, { score, snippet })
      else found.set(id, { score: Math.max(prev.score, score) + 5, snippet: prev.snippet || snippet })
    }

    // Body text (plain notes), via the FTS table.
    if (this.fts !== 'none') {
      const { where, params, ranked } = termFilter('search_index', ['title', 'content'], terms, this.fts)
      where.push("type LIKE 'note:%'")
      try {
        const rows = this.db.query<{ title: string; content: string; type: string }>(
          `SELECT title, content, type FROM search_index WHERE ${where.join(' AND ')}${ranked ? ' ORDER BY rank' : ''} LIMIT ?`,
          [...params, limit * 4],
        )
        for (const r of rows) add(r.type.slice('note:'.length), scoreOf(r.title, r.content, terms), makeSnippet(r.content, terms))
      } catch (e) {
        console.warn('[search] note query failed', terms, e)
      }
    }

    // Titles of every note type (mind maps and handwriting aren't in the FTS table).
    const titleWhere = terms.map(() => `title LIKE ? ${LIKE_ESCAPE}`).join(' AND ')
    for (const r of this.db.query<{ id: string; title: string }>(
      `SELECT id, title FROM notes WHERE ${titleWhere} LIMIT ?`, [...terms.map(likeParam), limit * 2],
    )) add(r.id, scoreOf(r.title, '', terms), '')

    // Mind-map node text: a map matches when one of its nodes contains every term.
    const nodeWhere = terms.map(() => `title LIKE ? ${LIKE_ESCAPE}`).join(' AND ')
    const nodesByMap = new Map<string, string[]>()
    for (const r of this.db.query<{ mindmap_id: string; title: string }>(
      `SELECT mindmap_id, title FROM mindmap_nodes WHERE ${nodeWhere} LIMIT ?`, [...terms.map(likeParam), limit * 4],
    )) {
      const list = nodesByMap.get(r.mindmap_id) ?? []
      list.push(r.title)
      nodesByMap.set(r.mindmap_id, list)
    }
    for (const [id, titles] of nodesByMap) add(id, 10 + scoreOf('', titles.join(' '), terms), titles.slice(0, 3).join(' · '))

    if (found.size === 0) return []
    // Title / type / recency come from the notes table, which also drops stale FTS rows.
    const ids = [...found.keys()]
    const rows = this.db.query<{ id: string; title: string; type: string; updated_at: string }>(
      `SELECT id, title, type, updated_at FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`, ids,
    )
    return rows
      .map(r => ({ r, f: found.get(r.id)! }))
      .sort((a, b) => b.f.score - a.f.score || b.r.updated_at.localeCompare(a.r.updated_at))
      .slice(0, limit)
      .map(({ r, f }) => ({ type: 'note' as const, id: r.id, title: r.title, snippet: f.snippet, score: f.score, noteType: r.type }))
  }

  /** Documents by title / file path, and by their text (one result per document: its best page). */
  private searchDocuments(terms: string[], limit: number): SearchResult[] {
    const where = terms.map(() => `(title LIKE ? ${LIKE_ESCAPE} OR path LIKE ? ${LIKE_ESCAPE})`).join(' AND ')
    const rows = this.db.query<{ id: string; title: string; path: string; type: string }>(
      `SELECT id, title, path, type FROM documents WHERE ${where} ORDER BY COALESCE(last_read_at, updated_at) DESC LIMIT ?`,
      [...terms.flatMap(t => [likeParam(t), likeParam(t)]), limit],
    )
    const byId = new Map<string, SearchResult>()
    for (const r of rows) byId.set(r.id, { type: 'document', id: r.id, title: r.title, snippet: r.path, score: scoreOf(r.title, r.path, terms), docType: r.type })
    for (const hit of this.searchDocText(terms, limit)) {
      const prev = byId.get(hit.id)
      if (prev) prev.score += 5   // matched by title already; the text agrees
      else byId.set(hit.id, hit)
    }
    return [...byId.values()]
  }

  /** Pages (PDF) / chapters (EPUB) / whole files whose text contains every term. */
  private searchDocText(queryTerms: string[], limit: number): SearchResult[] {
    if (this.docText === 'none') return []
    const terms = queryTerms.map(foldSearchText)
    const { where, params, ranked } = termFilter('doc_text', ['content'], terms, this.docText)
    // One row per document — its best page and how many pages match — chosen in
    // SQL. Taking the first N matching pages instead let one long book that
    // matches on every page fill the whole result and hide every other document.
    const order = ranked ? 'doc_text.rank' : 'doc_text.page'
    let rows: Array<{ doc_id: string; page: number; content: string; title: string; type: string; hits: number }>
    try {
      // Rank on row ids only; the page text (megabytes over many matches) is
      // read just for the pages picked.
      rows = this.db.query(
        `WITH hits AS (
           SELECT doc_text.rowid AS rid, doc_text.doc_id AS doc_id, ${order} AS ord
             FROM doc_text WHERE ${where.join(' AND ')}
         ), best AS (
           SELECT rid, doc_id, ord,
                  ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY ord) AS rn,
                  COUNT(*) OVER (PARTITION BY doc_id) AS hits
             FROM hits
         )
         SELECT b.doc_id AS doc_id, t.page AS page, t.content AS content, d.title AS title, d.type AS type, b.hits AS hits
           FROM best b JOIN doc_text t ON t.rowid = b.rid JOIN documents d ON d.id = b.doc_id
          WHERE b.rn = 1 ORDER BY b.ord LIMIT ?`,
        [...params, limit],
      )
    } catch (e) {
      console.warn('[search] document text query failed', terms, e)
      return []
    }
    return rows.map(r => ({
      type: 'document' as const, id: r.doc_id, title: r.title, snippet: makeSnippet(r.content, terms),
      // Text hits rank below title hits; more matching pages, a little higher.
      score: 30 + Math.min(scoreOf('', r.content, terms), 20) + Math.min(r.hits - 1, 10),
      page: r.type === 'pdf' || r.type === 'epub' ? r.page : null,
      docType: r.type,
    }))
  }

  private searchAnnotations(terms: string[], limit: number): SearchResult[] {
    const where = terms.map(() => `(a.selected_text LIKE ? ${LIKE_ESCAPE} OR a.content LIKE ? ${LIKE_ESCAPE})`).join(' AND ')
    const rows = this.db.query<{ id: string; doc_id: string; page: number | null; selected_text: string | null; content: string | null; doc_title: string }>(
      `SELECT a.id, a.doc_id, a.page, a.selected_text, a.content, d.title AS doc_title
         FROM annotations a JOIN documents d ON d.id = a.doc_id
        WHERE ${where} ORDER BY a.updated_at DESC LIMIT ?`,
      [...terms.flatMap(t => [likeParam(t), likeParam(t)]), limit],
    )
    return rows.map(r => {
      const text = [r.selected_text, r.content].filter(Boolean).join(' — ')
      return { type: 'annotation' as const, id: r.id, title: r.doc_title, snippet: makeSnippet(text, terms), score: scoreOf('', text, terms), docId: r.doc_id, page: r.page }
    })
  }
}
