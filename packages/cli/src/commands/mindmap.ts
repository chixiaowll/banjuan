import { Command } from 'commander'
import chalk from 'chalk'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const mindmapCmd = new Command('mindmap').description('脑图管理')

mindmapCmd
  .command('create')
  .description('创建脑图')
  .argument('<title>', '脑图标题')
  .option('--doc <doc-id>', '关联文档 ID')
  .action(async (title: string, opts: { doc?: string }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const mm = await lib.mindmaps.create({ title, docId: opts.doc })
      console.log(chalk.green(`✓ 已创建脑图：${mm.title} (${mm.id})`))
    } finally {
      await lib.close()
    }
  })

mindmapCmd
  .command('list')
  .description('列出脑图')
  .option('--doc <doc-id>', '按关联文档筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { doc?: string; json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const maps = await lib.mindmaps.list({ docId: opts.doc })
      if (opts.json) {
        outputJson(maps)
      } else {
        if (maps.length === 0) { console.log('暂无脑图'); return }
        outputTable(
          ['ID', '标题', '布局', '关联文档', '创建时间'],
          maps.map(m => [
            m.id.slice(0, 8), m.title, m.layout,
            m.docId?.slice(0, 8) ?? '-',
            new Date(m.createdAt).toLocaleDateString('zh-CN'),
          ]),
        )
      }
    } finally {
      await lib.close()
    }
  })

mindmapCmd
  .command('show')
  .description('查看脑图结构')
  .argument('<id>', '脑图 ID')
  .option('--json', 'JSON 输出')
  .action(async (id: string, opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const mm = await lib.mindmaps.get(id)
      if (!mm) { console.error('脑图不存在'); process.exit(1) }
      const nodes = await lib.mindmaps.getNodes(id)
      const edges = await lib.mindmaps.getEdges(id)
      if (opts.json) {
        outputJson({ ...mm, nodes, edges })
      } else {
        outputItem([
          ['ID', mm.id],
          ['标题', mm.title],
          ['布局', mm.layout],
          ['节点数', nodes.length.toString()],
          ['连线数', edges.length.toString()],
        ])
        if (nodes.length > 0) {
          console.log('')
          printTree(nodes, null, '')
        }
      }
    } finally {
      await lib.close()
    }
  })

function printTree(nodes: any[], parentId: string | null, prefix: string): void {
  const children = nodes.filter(n => n.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  for (let i = 0; i < children.length; i++) {
    const isLast = i === children.length - 1
    const connector = isLast ? '└── ' : '├── '
    console.log(`${prefix}${connector}${children[i].title}`)
    printTree(nodes, children[i].id, prefix + (isLast ? '    ' : '│   '))
  }
}
