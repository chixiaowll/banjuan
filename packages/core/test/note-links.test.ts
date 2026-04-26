import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteLinkService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  async function createNote(title: string) {
    return lib.notes.create({ title, content: `Content of ${title}` })
  }

  it('sync creates links for a source note', async () => {
    const a = await createNote('Note A')
    const b = await createNote('Note B')
    const c = await createNote('Note C')

    await lib.noteLinks.sync(a.id, [
      { targetId: b.id, context: 'references B' },
      { targetId: c.id, context: 'references C' },
    ])

    const forward = await lib.noteLinks.getForwardLinks(a.id)
    expect(forward).toHaveLength(2)
    expect(forward.map(l => l.targetId).sort()).toEqual([b.id, c.id].sort())
  })

  it('getForwardLinks returns links from source', async () => {
    const a = await createNote('Note A')
    const b = await createNote('Note B')

    await lib.noteLinks.sync(a.id, [
      { targetId: b.id, context: 'see Note B' },
    ])

    const forward = await lib.noteLinks.getForwardLinks(a.id)
    expect(forward).toHaveLength(1)
    expect(forward[0]).toEqual({
      sourceId: a.id,
      targetId: b.id,
      context: 'see Note B',
    })
  })

  it('getBacklinks returns links pointing to target', async () => {
    const a = await createNote('Note A')
    const b = await createNote('Note B')
    const c = await createNote('Note C')

    await lib.noteLinks.sync(a.id, [{ targetId: c.id, context: 'A->C' }])
    await lib.noteLinks.sync(b.id, [{ targetId: c.id, context: 'B->C' }])

    const backlinks = await lib.noteLinks.getBacklinks(c.id)
    expect(backlinks).toHaveLength(2)
    expect(backlinks.map(l => l.sourceId).sort()).toEqual([a.id, b.id].sort())
  })

  it('sync replaces old links for same source', async () => {
    const a = await createNote('Note A')
    const b = await createNote('Note B')
    const c = await createNote('Note C')

    await lib.noteLinks.sync(a.id, [{ targetId: b.id, context: 'old link' }])
    await lib.noteLinks.sync(a.id, [{ targetId: c.id, context: 'new link' }])

    const forward = await lib.noteLinks.getForwardLinks(a.id)
    expect(forward).toHaveLength(1)
    expect(forward[0].targetId).toBe(c.id)
    expect(forward[0].context).toBe('new link')
  })

  it('removeAllForNote removes links where note is source or target', async () => {
    const a = await createNote('Note A')
    const b = await createNote('Note B')
    const c = await createNote('Note C')

    await lib.noteLinks.sync(a.id, [{ targetId: b.id, context: 'A->B' }])
    await lib.noteLinks.sync(c.id, [{ targetId: a.id, context: 'C->A' }])

    await lib.noteLinks.removeAllForNote(a.id)

    const forwardA = await lib.noteLinks.getForwardLinks(a.id)
    expect(forwardA).toHaveLength(0)

    const backlinksA = await lib.noteLinks.getBacklinks(a.id)
    expect(backlinksA).toHaveLength(0)

    // C's forward link to A should also be removed
    const forwardC = await lib.noteLinks.getForwardLinks(c.id)
    expect(forwardC).toHaveLength(0)
  })
})
