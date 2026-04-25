import { Command } from 'commander'
import chalk from 'chalk'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const noteCmd = new Command('note').description('笔记管理')

noteCmd
  .command('create')
  .description('创建笔记')
  .argument('<title>', '笔记标题')
  .option('--doc <doc-id>', '关联文档 ID')
  .action(async (title: string, opts: { doc?: string }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const note = await lib.notes.create({ title, docId: opts.doc })
      console.log(chalk.green(`✓ 已创建笔记：${note.title} (${note.id})`))
    } finally {
      await lib.close()
    }
  })

noteCmd
  .command('list')
  .description('列出笔记')
  .option('--doc <doc-id>', '按关联文档筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { doc?: string; json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const notes = await lib.notes.list({ docId: opts.doc })
      if (opts.json) {
        outputJson(notes)
      } else {
        if (notes.length === 0) { console.log('暂无笔记'); return }
        outputTable(
          ['ID', '标题', '关联文档', '创建时间'],
          notes.map(n => [
            n.id.slice(0, 8), n.title,
            n.docId?.slice(0, 8) ?? '-',
            new Date(n.createdAt).toLocaleDateString('zh-CN'),
          ]),
        )
      }
    } finally {
      await lib.close()
    }
  })

noteCmd
  .command('show')
  .description('显示笔记内容')
  .argument('<id>', '笔记 ID')
  .option('--json', 'JSON 输出')
  .action(async (id: string, opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const note = await lib.notes.get(id)
      if (!note) { console.error('笔记不存在'); process.exit(1) }
      if (opts.json) {
        outputJson(note)
      } else {
        outputItem([
          ['ID', note.id],
          ['标题', note.title],
          ['关联文档', note.docId ?? '-'],
          ['创建', new Date(note.createdAt).toLocaleString('zh-CN')],
        ])
        console.log('\n' + note.content)
      }
    } finally {
      await lib.close()
    }
  })
