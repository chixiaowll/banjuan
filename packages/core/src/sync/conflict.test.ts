import { describe, it, expect } from 'vitest'
import { conflictCopyPath, rewriteNoteConflict } from './conflict.js'

describe('conflictCopyPath', () => {
  it('inserts the suffix before the extension', () => {
    expect(conflictCopyPath('.banjuan/notes/a.json', 1700, 'iPad-ab12'))
      .toBe('.banjuan/notes/a.sync-conflict-1700-iPadab12.json')
  })
  it('handles no extension', () => {
    expect(conflictCopyPath('notes/README', 1700, 'mac')).toBe('notes/README.sync-conflict-1700-mac')
  })
  it('sanitizes/truncates the device id', () => {
    expect(conflictCopyPath('a.md', 1, 'chixiaos-MacBook.local'))
      .toBe('a.sync-conflict-1-chixiaosMacB.md')
  })
})

describe('rewriteNoteConflict', () => {
  it('rewrites id + title and records conflict metadata for a note', () => {
    const note = JSON.stringify({ meta: { id: 'orig-1', title: '六月日记', type: 'markdown' }, blocks: [] })
    const out = rewriteNoteConflict(note, { newId: 'new-2', ts: 1700, deviceId: 'iPad' })!
    const parsed = JSON.parse(out)
    expect(parsed.meta.id).toBe('new-2')
    expect(parsed.meta.conflictOf).toBe('orig-1')
    expect(parsed.meta.conflictDevice).toBe('iPad')
    expect(parsed.meta.conflictAt).toBe(1700)
    expect(parsed.meta.title).toContain('六月日记')
    expect(parsed.meta.title).toContain('冲突')
    expect(parsed.blocks).toEqual([]) // content preserved
  })
  it('returns null for non-note JSON (no meta.id)', () => {
    expect(rewriteNoteConflict(JSON.stringify({ id: 'doc-1' }), { newId: 'x', ts: 1, deviceId: 'd' })).toBeNull()
  })
  it('returns null for unparseable/binary content', () => {
    expect(rewriteNoteConflict('%PDF-1.7 binary…', { newId: 'x', ts: 1, deviceId: 'd' })).toBeNull()
  })
})

describe('rewriteNoteConflict for a mind map', () => {
  it('gives nodes, edges, boundaries and summaries new ids and keeps references consistent', () => {
    let n = 0
    const makeId = () => `new-${++n}`
    const map = JSON.stringify({
      meta: { id: 'mm-1', title: 'Map' },
      nodes: [{ id: 'r', parentId: null }, { id: 'a', parentId: 'r' }, { id: 's', parentId: null, floating: true }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'r' }],
      boundaries: [{ id: 'b1', nodeIds: ['a'] }],
      summaries: [{ id: 'sm1', nodeIds: ['a'], summaryNodeId: 's' }],
    })
    const out = JSON.parse(rewriteNoteConflict(map, { newId: 'mm-2', ts: 1700, deviceId: 'iPad', makeId })!)
    const ids = out.nodes.map((x: any) => x.id)
    expect(ids.some((id: string) => ['r', 'a', 's'].includes(id))).toBe(false)
    const [r, a, s] = out.nodes
    expect(a.parentId).toBe(r.id)
    expect(out.edges[0]).toMatchObject({ sourceId: a.id, targetId: r.id })
    expect(out.edges[0].id).not.toBe('e1')
    expect(out.boundaries[0].nodeIds).toEqual([a.id])
    expect(out.summaries[0]).toMatchObject({ nodeIds: [a.id], summaryNodeId: s.id })
  })
})
