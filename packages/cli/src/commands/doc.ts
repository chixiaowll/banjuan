import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const docCmd = new Command('doc').description('文档管理')

docCmd
  .command('import')
  .description('导入文档')
  .argument('<file>', '文件路径')
  .option('--title <title>', '自定义标题')
  .action(async (file: string, opts: { title?: string }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const doc = await lib.documents.import(resolve(file), { title: opts.title })
      console.log(chalk.green(`✓ 已导入：${doc.title} (${doc.id})`))
    } finally {
      await lib.close()
    }
  })

docCmd
  .command('list')
  .description('列出文档')
  .option('--tag <tag>', '按标签筛选')
  .option('--type <type>', '按类型筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { tag?: string; type?: string; json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const docs = await lib.documents.list({ tag: opts.tag, type: opts.type as any })
      if (opts.json) {
        outputJson(docs)
      } else {
        if (docs.length === 0) { console.log('暂无文档'); return }
        outputTable(
          ['ID', '标题', '类型', '创建时间'],
          docs.map(d => [d.id.slice(0, 8), d.title, d.type, new Date(d.createdAt).toLocaleDateString('zh-CN')]),
        )
      }
    } finally {
      await lib.close()
    }
  })

docCmd
  .command('info')
  .description('查看文档详情')
  .argument('<id>', '文档 ID')
  .option('--json', 'JSON 输出')
  .action(async (id: string, opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const doc = await lib.documents.get(id)
      if (!doc) { console.error('文档不存在'); process.exit(1) }
      if (opts.json) {
        outputJson(doc)
      } else {
        outputItem([
          ['ID', doc.id],
          ['标题', doc.title],
          ['类型', doc.type],
          ['路径', doc.path],
          ['哈希', doc.hash.slice(0, 12) + '...'],
          ['创建', new Date(doc.createdAt).toLocaleString('zh-CN')],
        ])
      }
    } finally {
      await lib.close()
    }
  })

docCmd
  .command('delete')
  .description('删除文档')
  .argument('<id>', '文档 ID')
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      await lib.documents.delete(id)
      console.log(chalk.green(`✓ 已删除文档 ${id}`))
    } finally {
      await lib.close()
    }
  })
