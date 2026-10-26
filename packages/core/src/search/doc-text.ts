import type { PlatformDatabase } from '../platform/index.js'

/**
 * Document full text for search. The app extracts each document's text in the
 * background (it needs pdf.js / unzip, so core only stores it) and hands it to
 * store(); pending() says what still needs doing — new documents, and those
 * whose file changed since (their hash differs). Search reads the table
 * directly (SearchService).
 */

export const DOC_TEXT_TYPES = ['pdf', 'epub', 'txt', 'md', 'html'] as const

export interface DocTextJob { id: string; path: string; type: string; hash: string }
export interface DocTextStats { total: number; indexed: number; pending: number; failed: number }

/**
 * Text extraction got better for these types (HTML / EPUB markup used to split
 * words at every inline tag): their state records `<hash>#<version>`, so text
 * stored by an older extractor counts as out of date and is redone.
 */
const EXTRACT_VERSION: Record<string, number> = { html: 2, epub: 2 }
const STATE_KEY_SQL = `d.hash || CASE d.type ${Object.entries(EXTRACT_VERSION).map(([t, v]) => `WHEN '${t}' THEN '#${v}'`).join(' ')} ELSE '' END`

/** Not extracted, changed since (or extracted by an older extractor), or its file was missing last time (e.g. still in the cloud). */
const PENDING_WHERE = `d.type IN (${DOC_TEXT_TYPES.map(t => `'${t}'`).join(', ')})
  AND (s.doc_id IS NULL OR s.hash != (${STATE_KEY_SQL}) OR s.status = 'missing')`

export class DocTextService {
  readonly available: boolean

  constructor(private db: PlatformDatabase) {
    let ok = false
    try { ok = !!db.queryOne("SELECT 1 FROM sqlite_master WHERE name = 'doc_text'") } catch { /* no sqlite_master */ }
    this.available = ok
  }

  /** Documents to extract, most recently read first. */
  pending(limit = 50): DocTextJob[] {
    if (!this.available) return []
    return this.db.query<DocTextJob>(
      `SELECT d.id, d.path, d.type, d.hash FROM documents d LEFT JOIN doc_text_state s ON s.doc_id = d.id
        WHERE ${PENDING_WHERE}
        ORDER BY COALESCE(d.last_read_at, d.updated_at) DESC LIMIT ?`, [limit])
  }

  /** Replace a document's text. Empty pages are skipped (scanned PDFs have none). */
  store(docId: string, hash: string, pages: Array<{ page: number; text: string }>): void {
    if (!this.available) return
    const kept = pages.filter(p => p.text.trim())
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_text WHERE doc_id = ?', [docId])
      for (const p of kept) this.db.run('INSERT INTO doc_text (content, doc_id, page) VALUES (?, ?, ?)', [p.text, docId, p.page])
      this.setState(docId, hash, 'ok', kept.length, null)
    })
  }

  /** 'missing': no file yet (retried next time); 'failed': unreadable (retried when the file changes). */
  markFailed(docId: string, hash: string, status: 'failed' | 'missing', error: string): void {
    if (!this.available) return
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_text WHERE doc_id = ?', [docId])
      this.setState(docId, hash, status, 0, error.slice(0, 500))
    })
  }

  remove(docId: string): void {
    if (!this.available) return
    this.db.run('DELETE FROM doc_text WHERE doc_id = ?', [docId])
    this.db.run('DELETE FROM doc_text_state WHERE doc_id = ?', [docId])
  }

  /** Drop text of documents that are gone. Returns how many. */
  prune(): number {
    if (!this.available) return 0
    const gone = this.db.query<{ doc_id: string }>('SELECT doc_id FROM doc_text_state WHERE doc_id NOT IN (SELECT id FROM documents)')
    for (const g of gone) this.remove(g.doc_id)
    return gone.length
  }

  stats(): DocTextStats {
    if (!this.available) return { total: 0, indexed: 0, pending: 0, failed: 0 }
    const types = DOC_TEXT_TYPES.map(t => `'${t}'`).join(', ')
    const total = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM documents WHERE type IN (${types})`)?.n ?? 0
    const pending = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM documents d LEFT JOIN doc_text_state s ON s.doc_id = d.id WHERE ${PENDING_WHERE}`)?.n ?? 0
    const failed = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM doc_text_state s JOIN documents d ON d.id = s.doc_id AND s.hash = (${STATE_KEY_SQL}) WHERE s.status = 'failed'`)?.n ?? 0
    return { total, pending, failed, indexed: total - pending - failed }
  }

  private setState(docId: string, hash: string, status: string, pages: number, error: string | null): void {
    const type = this.db.queryOne<{ type: string }>('SELECT type FROM documents WHERE id = ?', [docId])?.type ?? ''
    if (EXTRACT_VERSION[type]) hash = `${hash}#${EXTRACT_VERSION[type]}`
    this.db.run(
      `INSERT INTO doc_text_state (doc_id, hash, status, pages, error, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET hash = excluded.hash, status = excluded.status, pages = excluded.pages,
         error = excluded.error, updated_at = excluded.updated_at`,
      [docId, hash, status, pages, error, new Date().toISOString()],
    )
  }
}
