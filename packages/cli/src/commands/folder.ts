import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost } from '../lib.js'
import { outputJson } from '../output.js'

export const folderCmd = new Command('folder').description('目录管理')

folderCmd
  .command('list')
  .description('列出目录')
  .requiredOption('--type <type>', '类型: notes 或 documents (必填)')
  .option('--json', 'JSON 输出')
  .action(async (opts: { type: string; json?: boolean }) => {
    const endpoint = opts.type === 'documents' ? '/api/documents/dirs' : '/api/notes/dirs'
    const dirs: string[] = await apiGet(endpoint)
    if (opts.json) {
      outputJson(dirs)
    } else {
      if (dirs.length === 0) { console.log('暂无目录'); return }
      for (const dir of dirs) {
        const depth = dir.split('/').length - 1
        const name = dir.split('/').pop()!
        const indent = '  '.repeat(depth)
        console.log(`${indent}📁 ${name}  ${chalk.dim(dir)}`)
      }
    }
  })

folderCmd
  .command('create')
  .description('创建目录')
  .argument('<name>', '目录名称（支持嵌套路径如 a/b/c）')
  .requiredOption('--type <type>', '类型: notes 或 documents (必填)')
  .action(async (name: string, opts: { type: string }) => {
    const endpoint = opts.type === 'documents' ? '/api/documents/dirs' : '/api/notes/dirs'
    await apiPost(endpoint, { path: name })
    console.log(chalk.green(`✓ 已创建${opts.type === 'documents' ? '文档' : '笔记'}目录：${name}`))
  })

folderCmd
  .command('rename')
  .description('重命名目录')
  .argument('<old-path>', '原路径')
  .argument('<new-path>', '新路径')
  .requiredOption('--type <type>', '类型: notes 或 documents (必填)')
  .action(async (oldPath: string, newPath: string, opts: { type: string }) => {
    if (opts.type === 'documents') {
      console.log(chalk.red('✗ 文档目录暂不支持重命名'))
      return
    }
    await apiPost('/api/notes/dirs/rename', { oldPath, newPath })
    console.log(chalk.green(`✓ 已重命名目录：${oldPath} → ${newPath}`))
  })
