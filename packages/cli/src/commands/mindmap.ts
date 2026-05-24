import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const mindmapCmd = new Command('mindmap').description('mindmap management')

mindmapCmd
  .command('create')
  .description('create a mindmap')
  .argument('<title>', 'mindmap title')
  .option('--doc <doc-id>', 'linked document ID')
  .action(async (title: string, opts: { doc?: string }) => {
    const mm = await apiPost('/api/mindmaps', { title, docId: opts.doc })
    console.log(chalk.green(`✓ Created mindmap: ${mm.title} (${mm.id})`))
  })

mindmapCmd
  .command('list')
  .description('list mindmaps')
  .option('--doc <doc-id>', 'filter by linked document')
  .option('--json', 'JSON output')
  .action(async (opts: { doc?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.doc) params.set('docId', opts.doc)
    const qs = params.toString()
    const maps = await apiGet(`/api/mindmaps${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(maps)
    } else {
      if (maps.length === 0) { console.log('No mindmaps'); return }
      outputTable(
        ['ID', 'Title', 'Layout', 'Document', 'Created'],
        maps.map((m: any) => [
          m.id, m.title, m.layout ?? '-',
          m.docId ?? '-',
          new Date(m.createdAt).toLocaleDateString(),
        ]),
      )
    }
  })

mindmapCmd
  .command('show')
  .description('show mindmap structure')
  .argument('<id>', 'mindmap ID')
  .option('--json', 'JSON output')
  .action(async (id: string, opts: { json?: boolean }) => {
    const mm = await apiGet(`/api/mindmaps/${encodeURIComponent(id)}`)
    if (opts.json) {
      outputJson(mm)
    } else {
      outputItem([
        ['ID', mm.id],
        ['Title', mm.title],
        ['Layout', mm.layout ?? '-'],
        ['Nodes', (mm.nodes?.length ?? 0).toString()],
        ['Edges', (mm.edges?.length ?? 0).toString()],
      ])
      if (mm.nodes?.length > 0) {
        console.log('')
        printTree(mm.nodes, null, '')
      }
    }
  })

mindmapCmd
  .command('add-node')
  .description('add a node')
  .argument('<mindmap-id>', 'mindmap ID')
  .argument('<title>', 'node title')
  .option('--parent <node-id>', 'parent node ID (defaults to root)')
  .option('--color <color>', 'node color')
  .option('--shape <shape>', 'node shape')
  .option('--content <content>', 'node content')
  .action(async (mindmapId: string, title: string, opts: { parent?: string; color?: string; shape?: string; content?: string }) => {
    const node = await apiPost(`/api/mindmaps/${encodeURIComponent(mindmapId)}/nodes`, {
      title, parentId: opts.parent, color: opts.color, shape: opts.shape, content: opts.content,
    })
    console.log(chalk.green(`✓ Added node: ${node.title} (${node.id})`))
  })

mindmapCmd
  .command('update-node')
  .description('update a node')
  .argument('<node-id>', 'node ID')
  .option('--title <title>', 'new title')
  .option('--color <color>', 'new color')
  .option('--content <content>', 'new content')
  .action(async (nodeId: string, opts: { title?: string; color?: string; content?: string }) => {
    const node = await apiPut(`/api/mindmaps/nodes/${encodeURIComponent(nodeId)}`, opts)
    console.log(chalk.green(`✓ Updated node: ${node.title}`))
  })

mindmapCmd
  .command('remove-node')
  .description('remove a node')
  .argument('<node-id>', 'node ID')
  .action(async (nodeId: string) => {
    await apiDelete(`/api/mindmaps/nodes/${encodeURIComponent(nodeId)}`)
    console.log(chalk.green('✓ Node removed'))
  })

mindmapCmd
  .command('add-edge')
  .description('add an edge')
  .argument('<mindmap-id>', 'mindmap ID')
  .requiredOption('--from <node-id>', 'source node ID')
  .requiredOption('--to <node-id>', 'target node ID')
  .option('--label <label>', 'edge label')
  .action(async (mindmapId: string, opts: { from: string; to: string; label?: string }) => {
    const edge = await apiPost(`/api/mindmaps/${encodeURIComponent(mindmapId)}/edges`, {
      sourceId: opts.from, targetId: opts.to, label: opts.label,
    })
    console.log(chalk.green(`✓ Added edge (${edge.id})`))
  })

mindmapCmd
  .command('remove-edge')
  .description('remove an edge')
  .argument('<edge-id>', 'edge ID')
  .action(async (edgeId: string) => {
    await apiDelete(`/api/mindmaps/edges/${encodeURIComponent(edgeId)}`)
    console.log(chalk.green('✓ Edge removed'))
  })

mindmapCmd
  .command('import')
  .description('bulk import nodes from JSON (can read from stdin)')
  .argument('<mindmap-id>', 'mindmap ID')
  .option('--file <path>', 'JSON file path')
  .option('--json <data>', 'JSON string')
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
    console.log(chalk.green(`✓ Imported: ${result.nodeCount} nodes, ${result.edgeCount} edges`))
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
