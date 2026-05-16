import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib.js'
import { outputJson } from '../output.js'

export const folderCmd = new Command('folder').description('目录管理')

folderCmd
  .command('list')
  .description('列出目录树')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }) => {
    const tree = await apiGet('/api/folders')
    if (opts.json) {
      outputJson(tree)
    } else {
      if (tree.length === 0) { console.log('暂无目录'); return }
      printTree(tree, '')
    }
  })

folderCmd
  .command('create')
  .description('创建目录')
  .argument('<name>', '目录名称')
  .option('--parent <folder-id>', '父目录 ID')
  .action(async (name: string, opts: { parent?: string }) => {
    const folder = await apiPost('/api/folders', { name, parentId: opts.parent })
    console.log(chalk.green(`✓ 已创建目录：${folder.name} (${folder.id})`))
  })

folderCmd
  .command('rename')
  .description('重命名目录')
  .argument('<id>', '目录 ID')
  .argument('<name>', '新名称')
  .action(async (id: string, name: string) => {
    const folder = await apiPut(`/api/folders/${encodeURIComponent(id)}`, { name })
    console.log(chalk.green(`✓ 已重命名目录：${folder.name}`))
  })

folderCmd
  .command('delete')
  .description('删除目录（笔记移至根目录）')
  .argument('<id>', '目录 ID')
  .action(async (id: string) => {
    await apiDelete(`/api/folders/${encodeURIComponent(id)}`)
    console.log(chalk.green('✓ 已删除目录'))
  })

function printTree(folders: any[], prefix: string): void {
  for (let i = 0; i < folders.length; i++) {
    const isLast = i === folders.length - 1
    const connector = isLast ? '└── ' : '├── '
    console.log(`${prefix}${connector}📁 ${folders[i].name}  ${chalk.dim(folders[i].id)}`)
    const children = folders[i].children ?? []
    if (children.length > 0) {
      printTree(children, prefix + (isLast ? '    ' : '│   '))
    }
  }
}
