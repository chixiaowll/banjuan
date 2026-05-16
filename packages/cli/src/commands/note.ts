import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const noteCmd = new Command('note').description('笔记管理')

noteCmd
  .command('create')
  .description('创建笔记')
  .argument('<title>', '笔记标题')
  .option('--doc <doc-id>', '关联文档 ID')
  .option('--folder <folder-id>', '所属目录 ID')
  .action(async (title: string, opts: { doc?: string; folder?: string }) => {
    const note = await apiPost('/api/notes', { title, docId: opts.doc, folderId: opts.folder })
    console.log(chalk.green(`✓ 已创建笔记：${note.title} (${note.id})`))
  })

noteCmd
  .command('list')
  .description('列出笔记')
  .option('--doc <doc-id>', '按关联文档筛选')
  .option('--type <type>', '按类型筛选')
  .option('--tag <tag>', '按标签筛选')
  .option('--folder <folder-id>', '按目录筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { doc?: string; type?: string; tag?: string; folder?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.doc) params.set('docId', opts.doc)
    if (opts.type) params.set('type', opts.type)
    if (opts.tag) params.set('tag', opts.tag)
    if (opts.folder) params.set('folderId', opts.folder)
    const qs = params.toString()
    const notes = await apiGet(`/api/notes${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(notes)
    } else {
      if (notes.length === 0) { console.log('暂无笔记'); return }
      outputTable(
        ['ID', '标题', '类型', '关联文档', '创建时间'],
        notes.map((n: any) => [
          n.id, n.title, n.type ?? 'markdown',
          n.docId ?? '-',
          new Date(n.createdAt).toLocaleDateString('zh-CN'),
        ]),
      )
    }
  })

noteCmd
  .command('show')
  .description('显示笔记内容')
  .argument('<id>', '笔记 ID')
  .action(async (id: string) => {
    const note = await apiGet(`/api/notes/${encodeURIComponent(id)}?format=markdown`)
    outputItem([
      ['ID', note.id],
      ['标题', note.title],
      ['类型', note.type ?? 'markdown'],
      ['关联文档', note.docId ?? '-'],
      ['创建', new Date(note.createdAt).toLocaleString('zh-CN')],
    ])
    if (note.content) {
      console.log('\n' + note.content)
    }
  })

noteCmd
  .command('delete')
  .description('删除笔记')
  .argument('<id>', '笔记 ID')
  .action(async (id: string) => {
    await apiDelete(`/api/notes/${encodeURIComponent(id)}`)
    console.log(chalk.green('✓ 已删除笔记'))
  })

noteCmd
  .command('update')
  .description('更新笔记')
  .argument('<id>', '笔记 ID')
  .option('--title <title>', '新标题')
  .option('--content <content>', '新内容（markdown 文本）')
  .action(async (id: string, opts: { title?: string; content?: string }) => {
    const body: Record<string, string> = {}
    if (opts.title) body.title = opts.title
    if (opts.content) body.content = opts.content
    const note = await apiPut(`/api/notes/${encodeURIComponent(id)}`, body)
    console.log(chalk.green(`✓ 已更新笔记：${note.title}`))
  })
