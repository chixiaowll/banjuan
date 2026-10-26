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

const TYPES_SQL = `d.type IN (${DOC_TEXT_TYPES.map(t => `'${t}'`).join(', ')})`
/** Not extracted, or changed since (or extracted by an older extractor). */
const FRESH_WHERE = `${TYPES_SQL} AND (s.doc_id IS NULL OR s.hash != (${STATE_KEY_SQL}))`
/** Its file was missing last time (e.g. still in the cloud). */
const MISSING_WHERE = `${TYPES_SQL} AND s.status = 'missing' AND s.hash = (${STATE_KEY_SQL})`
/** Either of the above. */
const PENDING_WHERE = `${TYPES_SQL} AND (s.doc_id IS NULL OR s.hash != (${STATE_KEY_SQL}) OR s.status = 'missing')`

export class DocTextService {
  readonly available: boolean

  constructor(private db: PlatformDatabase) {
    let ok = false
    try { ok = !!db.queryOne("SELECT 1 FROM sqlite_master WHERE name = 'doc_text'") } catch { /* no sqlite_master */ }
    this.available = ok
  }

  /** Documents to extract, most recently read first. */
  pending(limit = 50, opts: { includeMissing?: boolean } = {}): DocTextJob[] {
    if (!this.available) return []
    return this.db.query<DocTextJob>(
      `SELECT d.id, d.path, d.type, d.hash FROM documents d LEFT JOIN doc_text_state s ON s.doc_id = d.id
        WHERE ${opts.includeMissing === false ? FRESH_WHERE : PENDING_WHERE}
        ORDER BY COALESCE(d.last_read_at, d.updated_at) DESC LIMIT ?`, [limit])
  }

  /**
   * Documents whose file wasn't there last time. Indexers check the file exists
   * before extracting again: retrying all of them on every pass sent each one
   * through extraction every 30 seconds, for nothing, while they stayed in the cloud.
   */
  missing(limit = 1000): DocTextJob[] {
    if (!this.available) return []
    return this.db.query<DocTextJob>(
      `SELECT d.id, d.path, d.type, d.hash FROM documents d JOIN doc_text_state s ON s.doc_id = d.id
        WHERE ${MISSING_WHERE} LIMIT ?`, [limit])
  }

  /** Replace a document's text. Empty pages are skipped (scanned PDFs have none). */
  /** `stamp`: the file's fileStamp() when it was read (see changedSince). */
  store(docId: string, hash: string, pages: Array<{ page: number; text: string }>, stamp?: string | null): void {
    if (!this.available) return
    const kept = pages.filter(p => p.text.trim())
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_text WHERE doc_id = ?', [docId])
      for (const p of kept) this.db.run('INSERT INTO doc_text (content, doc_id, page) VALUES (?, ?, ?)', [p.text, docId, p.page])
      this.setState(docId, hash, 'ok', kept.length, null, stamp ?? null)
    })
  }

  /** 'missing': no file yet (retried next time); 'failed': unreadable (retried when the file changes). */
  markFailed(docId: string, hash: string, status: 'failed' | 'missing', error: string, stamp?: string | null): void {
    if (!this.available) return
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_text WHERE doc_id = ?', [docId])
      this.setState(docId, hash, status, 0, error.slice(0, 500), stamp ?? null)
    })
  }

  /**
   * Documents done (or failed) whose file is no longer the one read: they are
   * made pending again. A document's hash comes from its path, so a file
   * replaced in place (edited elsewhere, synced in) kept its old text for good.
   * `stampOf` gives the file's current fileStamp(), or null when it isn't there.
   */
  async recheckChanged(stampOf: (path: string) => Promise<string | null>): Promise<number> {
    if (!this.available) return 0
    const rows = this.db.query<{ id: string; path: string; stamp: string }>(
      `SELECT d.id, d.path, s.file_stamp AS stamp FROM doc_text_state s JOIN documents d ON d.id = s.doc_id
        WHERE s.file_stamp IS NOT NULL AND s.status IN ('ok', 'failed')`)
    let changed = 0
    for (const r of rows) {
      const now = await stampOf(r.path)
      if (now && now !== r.stamp) {
        this.db.run('DELETE FROM doc_text_state WHERE doc_id = ?', [r.id])
        changed++
      }
    }
    return changed
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

  /** Characters of document text stored, all documents together. */
  totalChars(): number {
    if (!this.available) return 0
    return this.db.queryOne<{ n: number }>('SELECT COALESCE(SUM(LENGTH(content)), 0) AS n FROM doc_text')?.n ?? 0
  }

  stats(): DocTextStats {
    if (!this.available) return { total: 0, indexed: 0, pending: 0, failed: 0 }
    const types = DOC_TEXT_TYPES.map(t => `'${t}'`).join(', ')
    const total = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM documents WHERE type IN (${types})`)?.n ?? 0
    const pending = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM documents d LEFT JOIN doc_text_state s ON s.doc_id = d.id WHERE ${PENDING_WHERE}`)?.n ?? 0
    const failed = this.db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM doc_text_state s JOIN documents d ON d.id = s.doc_id AND s.hash = (${STATE_KEY_SQL}) WHERE s.status = 'failed'`)?.n ?? 0
    return { total, pending, failed, indexed: total - pending - failed }
  }

  private setState(docId: string, hash: string, status: string, pages: number, error: string | null, stamp: string | null): void {
    const type = this.db.queryOne<{ type: string }>('SELECT type FROM documents WHERE id = ?', [docId])?.type ?? ''
    if (EXTRACT_VERSION[type]) hash = `${hash}#${EXTRACT_VERSION[type]}`
    this.db.run(
      `INSERT INTO doc_text_state (doc_id, hash, status, pages, error, updated_at, file_stamp) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET hash = excluded.hash, status = excluded.status, pages = excluded.pages,
         error = excluded.error, updated_at = excluded.updated_at, file_stamp = excluded.file_stamp`,
      [docId, hash, status, pages, error, new Date().toISOString(), stamp],
    )
  }
}

/** A file's version as far as indexes go: its size and modification time. */
export function fileStamp(size: number, mtimeMs: number): string {
  return `${size}:${Math.floor(mtimeMs)}`
}
