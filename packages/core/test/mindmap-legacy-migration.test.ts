import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, testDeps } from './helpers.js'

// Mind maps kept in the old folders become notes once; deleting or moving the
// note afterwards must stick across later opens.
describe('legacy mind-map migration', () => {
  const legacy = (root: string, id: string, title: string) => {
    const dir = join(root, '.banjuan', 'data', 'mindmaps')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, title, nodes: [{ id: `${id}-root`, parentId: null, title }], edges: [] }))
  }

  it('migrates each map once: deleted or moved notes stay so, and one bad file doesn\'t stop the rest', async () => {
    const root = join(createTempDir(), 'lib')
    const deps = testDeps()
    let lib = await Library.init(root, deps)
    await lib.close()
    const dir = join(root, '.banjuan', 'data', 'mindmaps')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '0-not-a-map.json'), JSON.stringify({ nothing: true }))
    legacy(root, 'mm-a', '甲图')
    legacy(root, 'mm-b', '乙图')

    lib = await Library.open(root, deps)
    await lib.createIndexService().rebuildFull()
    const titles = (await lib.notes.list()).map(n => n.title).sort()
    expect(titles).toEqual(['乙图', '甲图'])

    await lib.notes.delete('mm-a')
    await lib.notes.createDir('收纳')
    await lib.notes.move('mm-b', '收纳')
    await lib.close()

    lib = await Library.open(root, deps)
    await lib.createIndexService().rebuildFull()
    expect((await lib.notes.list()).map(n => [n.title, n.path])).toEqual([['乙图', '收纳/mm-b.json']])
    expect(existsSync(join(root, '.banjuan', 'notes', 'mm-a.json'))).toBe(false)
    expect(readdirSync(join(root, '.banjuan', 'notes')).filter(f => f.endsWith('.json'))).toEqual([])
    await lib.close()
  })
})
