import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { Library } from '../src/library.js'
import { escapeLike } from '../src/db/like.js'

function deps() {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), globalPluginsDir: join(tmpdir(), 'gp') }
}

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape char itself', () => {
    expect(escapeLike('my_notes')).toBe('my\\_notes')
    expect(escapeLike('100%/a\\b')).toBe('100\\%/a\\\\b')
    expect(escapeLike('普通文件夹')).toBe('普通文件夹')
  })
})

// `_` and `%` in folder names used to be LIKE wildcards: "my_notes/%" also
// matched "my-notes/…", so folder operations hit a sibling folder.
describe('folder operations only touch their own folder', () => {
  it('deleting notes folder "my_notes" leaves "my-notes" alone', async () => {
    const lib = await Library.init(mkdtempSync(join(tmpdir(), 'like-')) + '/lib', deps() as any, 'T')
    const a = await lib.notes.create({ title: 'A', folder: 'my_notes' } as any)
    const b = await lib.notes.create({ title: 'B', folder: 'my-notes' } as any)
    const listed = await lib.notes.list({ folder: 'my_notes' } as any)
    expect(listed.map((n: any) => n.id)).toEqual([a.id])
    await lib.notes.deleteDir('my_notes')
    expect(await lib.notes.get(a.id)).toBeNull()
    expect(await lib.notes.get(b.id)).not.toBeNull()
  })

  it('deleting documents folder "a_b" leaves "axb" and its files alone', async () => {
    const lib = await Library.init(mkdtempSync(join(tmpdir(), 'like-')) + '/lib', deps() as any, 'T')
    for (const dir of ['a_b', 'axb']) {
      mkdirSync(join(lib.rootPath, dir), { recursive: true })
      writeFileSync(join(lib.rootPath, dir, 'p.md'), '# p')
    }
    const keep = await lib.documents.import(join(lib.rootPath, 'axb', 'p.md'))
    await lib.documents.import(join(lib.rootPath, 'a_b', 'p.md'))
    await lib.documents.deleteDir('a_b')
    expect(await lib.documents.get(keep.id)).not.toBeNull()
    expect(existsSync(join(lib.rootPath, 'axb', 'p.md'))).toBe(true)
  })
})
