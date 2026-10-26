import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'
import { Library } from '../src/library.js'

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text, styles: {} }], children: [] })

describe('note excerpts in lists', () => {
  let tempDir: string
  let lib: Library
  beforeEach(async () => { tempDir = createTempDir(); lib = await Library.init(join(tempDir, 'lib'), testDeps()) })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('gives a note the start of its text, whitespace collapsed and capped', async () => {
    const short = await lib.notes.create({ title: '短', content: JSON.stringify([para('第一段'), para('第二段\n换行')]) })
    const long = await lib.notes.create({ title: '长', content: JSON.stringify([para('字'.repeat(400))]) })
    const empty = await lib.notes.create({ title: '空' })
    const byId = new Map((await lib.notes.list()).map(n => [n.id, n]))
    expect(byId.get(short.id)!.excerpt).toBe('第一段 第二段 换行')
    expect(byId.get(long.id)!.excerpt).toBe('字'.repeat(160) + '…')
    expect(byId.get(empty.id)!.excerpt).toBeUndefined()
  })

  it('gives a mind map its first branches (not the root, which repeats the title)', async () => {
    const map = await lib.notes.create({ title: '导图', type: 'mindmap' })
    const nodes = await lib.mindmaps.getNodes(map.id)
    const root = nodes.find(n => !n.parentId)!
    expect((await lib.notes.list({ type: 'mindmap' }))[0].excerpt).toBeUndefined()   // only the root so far
    await lib.mindmaps.addNode(map.id, { title: '分支一', parentId: root.id })
    await lib.mindmaps.addNode(map.id, { title: '分支二', parentId: root.id })
    expect((await lib.notes.list({ type: 'mindmap' }))[0].excerpt).toBe('分支一 · 分支二')
  })
})
