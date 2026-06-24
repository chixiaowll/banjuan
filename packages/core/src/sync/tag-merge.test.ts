import { describe, it, expect } from 'vitest'
import { mergeTagState, type TagState } from './tag-merge.js'

const tag = (name: string, updatedAt: number, color: string | null = null, id = `id-${name}-${updatedAt}`) =>
  ({ id, name, color, updatedAt })

describe('mergeTagState', () => {
  it('unions disjoint catalogs (no data loss when a new empty device joins)', () => {
    const local: TagState = { tags: [], tombstones: [] }              // fresh device
    const remote: TagState = { tags: [tag('重要', 100), tag('待办', 100)], tombstones: [] }
    const merged = mergeTagState(local, remote, { now: 1000 })
    expect(merged.tags.map(t => t.name)).toEqual(['待办', '重要'])
  })

  it('dedupes same name by latest updatedAt, color follows the winner', () => {
    const local: TagState = { tags: [tag('重要', 200, 'red')], tombstones: [] }
    const remote: TagState = { tags: [tag('重要', 100, 'blue')], tombstones: [] }
    const merged = mergeTagState(local, remote, { now: 1000 })
    expect(merged.tags).toHaveLength(1)
    expect(merged.tags[0].color).toBe('red')
  })

  it('a deletion newer than the tag removes it on both sides', () => {
    const local: TagState = { tags: [tag('重要', 100)], tombstones: [] }
    const remote: TagState = { tags: [], tombstones: [{ name: '重要', deletedAt: 200 }] }
    const merged = mergeTagState(local, remote, { now: 1000 })
    expect(merged.tags).toHaveLength(0)
    expect(merged.tombstones).toEqual([{ name: '重要', deletedAt: 200 }])
  })

  it('re-creating a tag after deletion wins (newer updatedAt beats the tombstone)', () => {
    const local: TagState = { tags: [tag('重要', 300, 'green')], tombstones: [] }  // re-added at 300
    const remote: TagState = { tags: [], tombstones: [{ name: '重要', deletedAt: 200 }] }
    const merged = mergeTagState(local, remote, { now: 1000 })
    expect(merged.tags.map(t => t.name)).toEqual(['重要'])
    // tombstone is superseded by the surviving newer tag → dropped
    expect(merged.tombstones).toHaveLength(0)
  })

  it('tombstones union by name keeping the latest deletedAt', () => {
    const local: TagState = { tags: [], tombstones: [{ name: 'x', deletedAt: 100 }] }
    const remote: TagState = { tags: [], tombstones: [{ name: 'x', deletedAt: 250 }] }
    const merged = mergeTagState(local, remote, { now: 1000 })
    expect(merged.tombstones).toEqual([{ name: 'x', deletedAt: 250 }])
  })

  it('GCs tombstones older than the retention window', () => {
    const now = 1_000_000_000
    const old = now - (100 * 24 * 60 * 60 * 1000)   // 100 days ago
    const local: TagState = { tags: [], tombstones: [{ name: 'old', deletedAt: old }, { name: 'recent', deletedAt: now - 1000 }] }
    const merged = mergeTagState(local, { tags: [], tombstones: [] }, { now })
    expect(merged.tombstones.map(t => t.name)).toEqual(['recent'])
  })

  it('is order-independent', () => {
    const a: TagState = { tags: [tag('重要', 300)], tombstones: [{ name: '待办', deletedAt: 150 }] }
    const b: TagState = { tags: [tag('待办', 100)], tombstones: [{ name: '重要', deletedAt: 200 }] }
    const ab = mergeTagState(a, b, { now: 1000 })
    const ba = mergeTagState(b, a, { now: 1000 })
    expect(ab).toEqual(ba)
  })
})
