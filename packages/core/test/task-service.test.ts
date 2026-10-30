import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'

describe('tasks: the checkboxes of notes, indexed', () => {
  let tempDir: string
  let lib: Library
  beforeEach(async () => { tempDir = createTempDir(); lib = await Library.init(join(tempDir, 'lib'), testDeps()) })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  const md = async (id: string) => blocksToMarkdown(JSON.parse((await lib.notes.get(id))!.content!), { banjuanLinks: true })
  const texts = (rows: Array<{ text: string }>) => rows.map(r => r.text)

  it('follows notes as they are written: new, edited (same id), checked, deleted; other blocks are not tasks', async () => {
    const n = await lib.notes.create({ title: '总览', folder: '[1] Projects/[2026Q4] 发布', content: '## Backlog\n\n- [ ] **[P0]** 部署测试环境 📅 2026-11-05\n- [ ] 写文档\n- 普通列表项\n\n挂起：[部署](banjuan://task/xxx)' })
    const [a, b] = lib.tasks.list({ status: 'open' })
    expect([a.text, a.priority, a.due, a.project, a.note.title, a.note.folder]).toEqual(['部署测试环境', 'P0', '2026-11-05', '[2026Q4] 发布', '总览', '[1] Projects/[2026Q4] 发布'])
    expect(b.text).toBe('写文档')
    expect(lib.tasks.list({ status: 'open' }).length).toBe(2)
    // an AI rewrites the note from its Markdown (ids ride along as ^id)
    await lib.notes.update(n.id, { content: (await md(n.id)).replace('写文档', '写部署文档').replace('- [ ] **[P0]**', '- [x] **[P0]**') }, { source: 'external' })
    const all = lib.tasks.list({ status: 'all' })
    expect(all.map(t => [t.id, t.text, t.done])).toEqual([[a.id, '部署测试环境', true], [b.id, '写部署文档', false]])
    expect(all[1].firstSeen).toBe(b.firstSeen)
    expect(all[0].doneAt).toBeTruthy()
    await lib.notes.delete(n.id)
    expect(lib.tasks.list({ status: 'all' })).toEqual([])
  })

  it('the project of a task is its first #tag, else the folder of its note; it follows moves and folder renames', async () => {
    const n = await lib.notes.create({ title: '202610', folder: '[0] DailyNotes', content: '- [ ] 跟进发布 #发布\n- [ ] 日常事' })
    expect(lib.tasks.list({}).map(t => t.project)).toEqual(['发布', '[0] DailyNotes'])
    expect(texts(lib.tasks.list({ project: '发布' }))).toEqual(['跟进发布 #发布'])
    await lib.notes.move(n.id, '归档')
    expect(lib.tasks.list({}).map(t => t.project)).toEqual(['发布', '归档'])
    await lib.notes.renameDir('归档', '[9] Archive')
    expect(lib.tasks.list({}).map(t => [t.project, t.note.folder])).toEqual([['发布', '[9] Archive'], ['[9] Archive', '[9] Archive']])
  })

  it('filters: open / done, due before, done since, a note', async () => {
    const n = await lib.notes.create({ title: 'n', content: '- [ ] 早 📅 2026-11-01\n- [ ] 晚 📅 2026-12-01\n- [ ] 无期\n- [x] 完成了 ✅ 2026-10-20' })
    expect(texts(lib.tasks.list({ status: 'open' }))).toEqual(['早', '晚', '无期'])   // by due date, undated last
    expect(texts(lib.tasks.list({ dueBefore: '2026-11-15' }))).toEqual(['早'])
    expect(texts(lib.tasks.list({ status: 'done', doneSince: '2026-10-01' }))).toEqual(['完成了'])
    expect(texts(lib.tasks.list({ status: 'done', doneSince: '2026-10-25' }))).toEqual([])
    expect(lib.tasks.list({ noteId: n.id }).length).toBe(3)
  })

  it('keeps the tasks (and when each was first seen) through a full rebuild', async () => {
    await lib.notes.create({ title: 'n', content: '- [ ] 甲\n- [ ] 乙' })
    const before = lib.tasks.list({})
    await new Promise(r => setTimeout(r, 15))
    await lib.createIndexService().rebuildFull()
    expect(lib.tasks.list({}).map(t => [t.id, t.firstSeen])).toEqual(before.map(t => [t.id, t.firstSeen]))
  })

  it('adds, completes, changes and moves tasks in their notes', async () => {
    const proj = await lib.notes.create({ title: '总览', content: '# 项目\n\n## Backlog\n\n- [ ] 已有' })
    const other = await lib.notes.create({ title: '另一篇', content: '## 待办' })
    const added = await lib.tasks.add({ text: '新任务', noteId: proj.id, section: '## Backlog', due: '2026-11-05', priority: 'P1' }, { by: 'cc-desk' })
    expect(await md(proj.id)).toContain(`- [ ] **[P1]** 新任务 📅 2026-11-05 ^${added.id}`)
    expect(lib.tasks.get(added.id)!.priority).toBe('P1')
    const done = await lib.tasks.complete(added.id, { comment: '已部署', today: '2026-10-30' })
    expect(done.done).toBe(true)
    expect(await md(proj.id)).toContain(`- [x] **[P1]** 新任务 📅 2026-11-05 ✅ 2026-10-30 ^${added.id}\n    已部署`)
    const [old] = lib.tasks.list({ status: 'open' })
    await lib.tasks.update(old.id, { text: '已有（改过）', due: '2026-12-01' })
    expect(lib.tasks.get(old.id)!.text).toBe('已有（改过）')
    await lib.tasks.update(old.id, { moveTo: { noteId: other.id, section: '## 待办' } })
    expect(lib.tasks.get(old.id)!.note.id).toBe(other.id)
    expect(await md(other.id)).toContain(`- [ ] 已有（改过） 📅 2026-12-01 ^${old.id}`)
    expect(await md(proj.id)).not.toContain('已有')
    expect((await lib.notes.history(proj.id)).some(v => v.by === 'cc-desk' || v.reason === 'external')).toBe(true)
    await expect(lib.tasks.complete('nope', {})).rejects.toThrow()
  })
})
