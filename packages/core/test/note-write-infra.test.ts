import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'

describe('writing notes from outside (programs, AI)', () => {
  let tempDir: string
  let lib: Library
  beforeEach(async () => { tempDir = createTempDir(); lib = await Library.init(join(tempDir, 'lib'), testDeps()) })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  const md = async (id: string) => blocksToMarkdown(JSON.parse((await lib.notes.get(id))!.content!))

  it('keeps a version before every outside write, and one per 10 minutes for the app\'s own saves', async () => {
    const n = await lib.notes.create({ title: '日记', content: '早上' })
    await lib.notes.update(n.id, { content: '中午' }, { source: 'external' })
    await lib.notes.update(n.id, { content: '下午' }, { source: 'external' })
    expect((await lib.notes.history(n.id)).map(v => [v.reason, v.preview])).toEqual([['external', '中午'], ['external', '早上']])
    const a = await lib.notes.create({ title: 'app', content: 'v1' })
    await lib.notes.update(a.id, { content: 'v2' })
    await lib.notes.update(a.id, { content: 'v3' })
    expect((await lib.notes.history(a.id)).map(v => v.preview)).toEqual(['v1'])
  })

  it('keeps an outside write that an editor then saves over', async () => {
    const n = await lib.notes.create({ title: 'n', content: 'v1' })
    await lib.notes.update(n.id, { content: 'v2' })
    await lib.notes.update(n.id, { content: '外部写入' }, { source: 'external' })
    await lib.notes.update(n.id, { content: '编辑器的旧内容' })
    expect((await lib.notes.history(n.id)).some(v => v.preview === '外部写入')).toBe(true)
  })

  it('restores a version, keeping what it replaced', async () => {
    const n = await lib.notes.create({ title: '原题', content: '原文' })
    await lib.notes.update(n.id, { title: '改题', content: '改坏了' }, { source: 'external' })
    const [original] = await lib.notes.history(n.id)
    const restored = await lib.notes.restore(n.id, original.version)
    expect(restored.title).toBe('原题')
    expect(await md(n.id)).toBe('原文')
    const [last] = await lib.notes.history(n.id)
    expect([last.reason, last.title, last.preview]).toEqual(['restore', '改题', '改坏了'])
    await expect(lib.notes.restore(n.id, '1-edit')).rejects.toThrow()
  })

  it('writes one section and leaves the rest of the note', async () => {
    const n = await lib.notes.create({ title: '202610', content: '# 十月工作日记\n\n## 20261027\n\n- 昨天' })
    await lib.notes.updateSection(n.id, '## 20261028', '- 上午', { mode: 'append', newAt: 'top' })
    await lib.notes.updateSection(n.id, '## 20261028', '- 下午', { mode: 'append', newAt: 'top' })
    expect(await md(n.id)).toBe('# 十月工作日记\n\n## 20261028\n\n- 上午\n\n- 下午\n\n## 20261027\n\n- 昨天')
    await lib.notes.updateSection(n.id, '## 20261027', '- 改写', { mode: 'replace' })
    expect(await md(n.id)).toBe('# 十月工作日记\n\n## 20261028\n\n- 上午\n\n- 下午\n\n## 20261027\n\n- 改写')
    expect((await lib.notes.history(n.id)).length).toBe(3)
    await expect(lib.notes.updateSection(n.id, '不是标题', 'x')).rejects.toThrow()
  })

  it('finds a note by title in its folder, or creates it once', async () => {
    const a = await lib.notes.ensure({ title: '202610', folder: '[0] DailyNotes', content: '# 十月' })
    const b = await lib.notes.ensure({ title: '202610', folder: '[0] DailyNotes', content: '# 不会用到' })
    expect([a.created, b.created, b.note.id]).toEqual([true, false, a.note.id])
    expect(await md(a.note.id)).toBe('# 十月')
    const other = await lib.notes.ensure({ title: '202610', folder: '[1] Projects' })
    const atRoot = await lib.notes.ensure({ title: '202610' })
    expect(new Set([a.note.id, other.note.id, atRoot.note.id]).size).toBe(3)
    expect(other.note.path.startsWith('[1] Projects/')).toBe(true)
  })

  it('lists notes changed since a time', async () => {
    const old = await lib.notes.create({ title: '旧' })
    const since = new Date(Date.now() + 5).toISOString()
    await new Promise(r => setTimeout(r, 20))
    const fresh = await lib.notes.create({ title: '新' })
    expect((await lib.notes.list({ since })).map(n => n.id)).toEqual([fresh.id])
    await lib.notes.update(old.id, { content: '改了' }, { source: 'external' })
    expect((await lib.notes.list({ since })).map(n => n.id).sort()).toEqual([fresh.id, old.id].sort())
  })
})
