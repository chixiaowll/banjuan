import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const docCmd = new Command('doc').description('文档管理')

docCmd
  .command('import')
  .description('导入文档到书房')
  .argument('<file>', '文件路径')
  .option('--dir <dir>', '目标子目录')
  .option('--title <title>', '自定义标题')
  .option('--tag <tags...>', '标签')
  .action(async (file: string, opts: { dir?: string; title?: string; tag?: string[] }) => {
    const { resolve } = await import('node:path')
    const absPath = resolve(file)
    const doc = await apiPost('/api/documents/import', {
      filePath: absPath,
      destDir: opts.dir,
      title: opts.title,
      tags: opts.tag,
    })
    console.log(chalk.green(`✓ 已导入文档：${doc.title}`))
    console.log(chalk.dim(`  ID: ${doc.id}`))
    console.log(chalk.dim(`  路径: ${doc.path}`))
  })

docCmd
  .command('refresh')
  .description('扫描书房目录，同步新增/删除的文件')
  .action(async () => {
    const result = await apiPost('/api/documents/refresh')
    console.log(chalk.green(`✓ 同步完成：新增 ${result.imported}，移除 ${result.removed}`))
  })

docCmd
  .command('list')
  .description('列出文档')
  .option('--tag <tag>', '按标签筛选')
  .option('--type <type>', '按类型筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { tag?: string; type?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.tag) params.set('tag', opts.tag)
    if (opts.type) params.set('type', opts.type)
    const qs = params.toString()
    const docs = await apiGet(`/api/documents${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(docs)
    } else {
      if (docs.length === 0) { console.log('暂无文档'); return }
      outputTable(
        ['ID', '标题', '类型', '创建时间'],
        docs.map((d: any) => [d.id, d.title, d.type, new Date(d.createdAt).toLocaleDateString('zh-CN')]),
      )
    }
  })

docCmd
  .command('info')
  .description('查看文档详情')
  .argument('<id>', '文档 ID')
  .option('--json', 'JSON 输出')
  .action(async (id: string, opts: { json?: boolean }) => {
    const doc = await apiGet(`/api/documents/${encodeURIComponent(id)}`)
    if (opts.json) {
      outputJson(doc)
    } else {
      outputItem([
        ['ID', doc.id],
        ['标题', doc.title],
        ['类型', doc.type],
        ['路径', doc.path],
        ['哈希', (doc.hash ?? '').slice(0, 12) + '...'],
        ['创建', new Date(doc.createdAt).toLocaleString('zh-CN')],
      ])
    }
  })

docCmd
  .command('delete')
  .description('删除文档')
  .argument('<id>', '文档 ID')
  .action(async (id: string) => {
    await apiDelete(`/api/documents/${encodeURIComponent(id)}`)
    console.log(chalk.green(`✓ 已删除文档 ${id}`))
  })
