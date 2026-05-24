import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost } from '../lib.js'
import { outputJson } from '../output.js'

export const folderCmd = new Command('folder').description('folder management')

folderCmd
  .command('list')
  .description('list folders')
  .requiredOption('--type <type>', 'type: notes or documents (required)')
  .option('--json', 'JSON output')
  .action(async (opts: { type: string; json?: boolean }) => {
    const endpoint = opts.type === 'documents' ? '/api/documents/dirs' : '/api/notes/dirs'
    const dirs: string[] = await apiGet(endpoint)
    if (opts.json) {
      outputJson(dirs)
    } else {
      if (dirs.length === 0) { console.log('No folders'); return }
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
  .description('create a folder')
  .argument('<name>', 'folder name (supports nested paths like a/b/c)')
  .requiredOption('--type <type>', 'type: notes or documents (required)')
  .action(async (name: string, opts: { type: string }) => {
    const endpoint = opts.type === 'documents' ? '/api/documents/dirs' : '/api/notes/dirs'
    await apiPost(endpoint, { path: name })
    console.log(chalk.green(`✓ Created ${opts.type === 'documents' ? 'document' : 'note'} folder: ${name}`))
  })

folderCmd
  .command('rename')
  .description('rename a folder')
  .argument('<old-path>', 'old path')
  .argument('<new-path>', 'new path')
  .requiredOption('--type <type>', 'type: notes or documents (required)')
  .action(async (oldPath: string, newPath: string, opts: { type: string }) => {
    if (opts.type === 'documents') {
      console.log(chalk.red('✗ Document folder renaming is not supported yet'))
      return
    }
    await apiPost('/api/notes/dirs/rename', { oldPath, newPath })
    console.log(chalk.green(`✓ Renamed folder: ${oldPath} → ${newPath}`))
  })
