import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, testDeps } from './helpers.js'

// Only primary keys existed: lookups by a junction table's second column, a
// document's path or a mind map's nodes all full-scanned their table.
describe('database indexes and pragmas', () => {
  it('creates the secondary indexes the queries rely on', async () => {
    const lib = await Library.init(join(createTempDir(), 'lib'), testDeps())
    const db = (lib as any).db
    const names = new Set(db.query("SELECT name FROM sqlite_master WHERE type = 'index'").map((r: any) => r.name))
    for (const idx of [
      'idx_documents_path', 'idx_annotations_doc', 'idx_notes_doc',
      'idx_note_links_target', 'idx_doc_links_target', 'idx_note_annotations_annotation',
      'idx_doc_tags_tag', 'idx_note_tags_tag', 'idx_mindmap_tags_tag',
      'idx_mindmap_nodes_mindmap', 'idx_mindmap_nodes_parent', 'idx_mindmap_edges_mindmap',
      'idx_mindmap_boundaries_mindmap', 'idx_mindmap_summaries_mindmap',
    ]) expect(names.has(idx), idx).toBe(true)
    const plan = db.query('EXPLAIN QUERY PLAN SELECT id FROM documents WHERE path = ?', ['a.pdf']).map((r: any) => r.detail).join(' ')
    expect(plan).toContain('idx_documents_path')
  })

  it('uses synchronous=NORMAL with WAL (no fsync per commit, still crash-safe)', async () => {
    const lib = await Library.init(join(createTempDir(), 'lib'), testDeps())
    const db = (lib as any).db
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal')
    expect(db.pragma('synchronous', { simple: true })).toBe(1)
  })
})
