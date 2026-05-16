import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const mindmapCmd = new Command('mindmap').description('脑图管理')

mindmapCmd
  .command('create')
  .description('创建脑图')
  .argument('<title>', '脑图标题')
  .option('--doc <doc-id>', '关联文档 ID')
  .action(async (title: string, opts: { doc?: string }) => {
    const mm = await apiPost('/api/mindmaps', { title, docId: opts.doc })
    console.log(chalk.green(`✓ 已创建脑图：${mm.title} (${mm.id})`))
  })

mindmapCmd
  .command('list')
  .description('列出脑图')
  .option('--doc <doc-id>', '按关联文档筛选')
  .option('--json', 'JSON 输出')
  .action(async (opts: { doc?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.doc) params.set('docId', opts.doc)
    const qs = params.toString()
    const maps = await apiGet(`/api/mindmaps${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(maps)
    } else {
      if (maps.length === 0) { console.log('暂无脑图'); return }
      outputTable(
        ['ID', '标题', '布局', '关联文档', '创建时间'],
        maps.map((m: any) => [
          m.id, m.title, m.layout ?? '-',
          m.docId ?? '-',
          new Date(m.createdAt).toLocaleDateString('zh-CN'),
        ]),
      )
    }
  })

mindmapCmd
  .command('show')
  .description('查看脑图结构')
  .argument('<id>', '脑图 ID')
  .option('--json', 'JSON 输出')
  .action(async (id: string, opts: { json?: boolean }) => {
    const mm = await apiGet(`/api/mindmaps/${encodeURIComponent(id)}`)
    if (opts.json) {
      outputJson(mm)
    } else {
      outputItem([
        ['ID', mm.id],
        ['标题', mm.title],
        ['布局', mm.layout ?? '-'],
        ['节点数', (mm.nodes?.length ?? 0).toString()],
        ['连线数', (mm.edges?.length ?? 0).toString()],
      ])
      if (mm.nodes?.length > 0) {
        console.log('')
        printTree(mm.nodes, null, '')
      }
    }
  })

mindmapCmd
  .command('add-node')
  .description('添加节点')
  .argument('<mindmap-id>', '脑图 ID')
  .argument('<title>', '节点标题')
  .option('--parent <node-id>', '父节点 ID（不指定则为根节点子节点）')
  .option('--color <color>', '节点颜色')
  .option('--shape <shape>', '节点形状')
  .option('--content <content>', '节点内容')
  .action(async (mindmapId: string, title: string, opts: { parent?: string; color?: string; shape?: string; content?: string }) => {
    const node = await apiPost(`/api/mindmaps/${encodeURIComponent(mindmapId)}/nodes`, {
      title, parentId: opts.parent, color: opts.color, shape: opts.shape, content: opts.content,
    })
    console.log(chalk.green(`✓ 已添加节点：${node.title} (${node.id})`))
  })

mindmapCmd
  .command('update-node')
  .description('更新节点')
  .argument('<node-id>', '节点 ID')
  .option('--title <title>', '新标题')
  .option('--color <color>', '新颜色')
  .option('--content <content>', '新内容')
  .action(async (nodeId: string, opts: { title?: string; color?: string; content?: string }) => {
    const node = await apiPut(`/api/mindmaps/nodes/${encodeURIComponent(nodeId)}`, opts)
    console.log(chalk.green(`✓ 已更新节点：${node.title}`))
  })

mindmapCmd
  .command('remove-node')
  .description('删除节点')
  .argument('<node-id>', '节点 ID')
  .action(async (nodeId: string) => {
    await apiDelete(`/api/mindmaps/nodes/${encodeURIComponent(nodeId)}`)
    console.log(chalk.green('✓ 已删除节点'))
  })

mindmapCmd
  .command('add-edge')
  .description('添加连线')
  .argument('<mindmap-id>', '脑图 ID')
  .requiredOption('--from <node-id>', '源节点 ID')
  .requiredOption('--to <node-id>', '目标节点 ID')
  .option('--label <label>', '连线标签')
  .action(async (mindmapId: string, opts: { from: string; to: string; label?: string }) => {
    const edge = await apiPost(`/api/mindmaps/${encodeURIComponent(mindmapId)}/edges`, {
      sourceId: opts.from, targetId: opts.to, label: opts.label,
    })
    console.log(chalk.green(`✓ 已添加连线 (${edge.id})`))
  })

mindmapCmd
  .command('remove-edge')
  .description('删除连线')
  .argument('<edge-id>', '连线 ID')
  .action(async (edgeId: string) => {
    await apiDelete(`/api/mindmaps/edges/${encodeURIComponent(edgeId)}`)
    console.log(chalk.green('✓ 已删除连线'))
  })

mindmapCmd
  .command('import')
  .description('从 JSON 批量导入节点（可从 stdin 读取）')
  .argument('<mindmap-id>', '脑图 ID')
  .option('--file <path>', 'JSON 文件路径')
  .option('--json <data>', 'JSON 字符串')
  .action(async (mindmapId: string, opts: { file?: string; json?: string }) => {
    let data: any
    if (opts.file) {
      data = JSON.parse(readFileSync(opts.file, 'utf-8'))
    } else if (opts.json) {
      data = JSON.parse(opts.json)
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk)
      data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    }
    const result = await apiPost(`/api/mindmaps/${encodeURIComponent(mindmapId)}/import`, data)
    console.log(chalk.green(`✓ 已导入：${result.nodeCount} 个节点，${result.edgeCount} 条连线`))
  })

function printTree(nodes: any[], parentId: string | null, prefix: string): void {
  const children = nodes.filter((n: any) => n.parentId === parentId).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
  for (let i = 0; i < children.length; i++) {
    const isLast = i === children.length - 1
    const connector = isLast ? '└── ' : '├── '
    console.log(`${prefix}${connector}${children[i].title}`)
    printTree(nodes, children[i].id, prefix + (isLast ? '    ' : '│   '))
  }
}
