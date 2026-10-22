import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { Library } from '../src/library.js'

function deps() {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), globalPluginsDir: join(tmpdir(), 'gp') }
}

// Sync ends with indexService.rebuildFull(), which clears the tag junction tables
// and refills them from the note files — tags must survive it.
describe('rebuildFull keeps tags', () => {
  it('restores note and mind-map tags from the note files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tag-rebuild-')) + '/lib'
    const lib = await Library.init(root, deps() as any, 'T')
    await lib.tags.create({ name: '重要' })
    const note = await lib.notes.create({ title: '笔记' } as any)
    const mm = await lib.notes.create({ title: '脑图', type: 'mindmap' } as any)
    await lib.tags.assign(note.id, 'note', ['重要'])
    await lib.tags.assign(mm.id, 'mindmap', ['重要'])

    await lib.createIndexService().rebuildFull()

    expect((await lib.tags.forTarget(note.id, 'note')).map(t => t.name)).toEqual(['重要'])
    expect((await lib.tags.forTarget(mm.id, 'mindmap')).map(t => t.name)).toEqual(['重要'])
  })
})
