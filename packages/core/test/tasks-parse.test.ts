import { describe, it, expect } from 'vitest'
import { extractTasks, ensureTaskIds } from '../src/notes/tasks.js'
import { markdownToBlocks } from '../src/notes/migration.js'
import { blocksToMarkdown } from '../src/notes/export-markdown.js'

const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: 'text', text, styles })
const task = (id: string | undefined, checked: boolean, content: any[], children: any[] = []) =>
  ({ ...(id ? { id } : {}), type: 'checkListItem', props: { checked }, content, children })

describe('extractTasks', () => {
  it('reads checkboxes — nested ones too — with due date, priority, tags and done date; other blocks are not tasks', () => {
    const blocks = [
      { type: 'heading', props: { level: 2 }, content: [t('Backlog')], children: [] },
      task('a1', false, [t('[P0]', { bold: true }), t(' 部署测试环境复现 #发布 📅 2026-11-05')], [
        task('a2', true, [t('写复现脚本 ✅ 2026-10-28')]),
      ]),
      { type: 'bulletListItem', content: [t('挂起：部署测试环境（已挂 3 天）'), { type: 'link', href: 'banjuan://task/a1', content: [t('↗')] }], children: [] },
      task('a3', false, [t('无日期的事')]),
    ]
    expect(extractTasks(blocks, 'n')).toEqual([
      { id: 'a1', text: '部署测试环境复现 #发布', done: false, due: '2026-11-05', doneDate: null, priority: 'P0', tags: ['发布'], position: 0 },
      { id: 'a2', text: '写复现脚本', done: true, due: null, doneDate: '2026-10-28', priority: null, tags: [], position: 1 },
      { id: 'a3', text: '无日期的事', done: false, due: null, doneDate: null, priority: null, tags: [], position: 2 },
    ])
  })

  it('gives a checkbox without an id one made from its note and text — the one ensureTaskIds then stores', () => {
    const blocks = [task(undefined, false, [t('新任务')]), task('keep', false, [t('已有')], [task(undefined, false, [t('子任务')])]), task(undefined, false, [t('新任务')])]
    const ids = extractTasks(blocks, 'note-1').map(x => x.id)
    expect(ids[1]).toBe('keep')
    expect(new Set(ids).size).toBe(4)   // the two "新任务" differ too
    expect(extractTasks(blocks, 'note-1').map(x => x.id)).toEqual(ids)   // stable
    expect(extractTasks(blocks, 'note-2')[0].id).not.toBe(ids[0])   // per note
    const { blocks: out, changed } = ensureTaskIds(blocks, 'note-1')
    expect(changed).toBe(true)
    expect(extractTasks(out, 'note-1').map(x => x.id)).toEqual(ids)
    expect(ensureTaskIds(out, 'note-1').changed).toBe(false)
  })
})

describe('task ids in Markdown for AI tools', () => {
  it('writes a checkbox with its id at the end and reads it back', () => {
    const blocks = [task('t-123', false, [t('部署 📅 2026-11-05')], [task('t-456', true, [t('子项')])])]
    const md = blocksToMarkdown(blocks, { banjuanLinks: true })
    expect(md).toBe('- [ ] 部署 📅 2026-11-05 ^t-123\n    - [x] 子项 ^t-456')
    expect(blocksToMarkdown(blocks)).not.toContain('^t-123')
    const back = markdownToBlocks(md) as any[]
    expect([back[0].id, back[0].children[0].id]).toEqual(['t-123', 't-456'])
    expect(back[0].content.map((c: any) => c.text).join('')).toBe('部署 📅 2026-11-05')
  })
})
