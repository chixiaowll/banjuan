import { Command } from 'commander'
import chalk from 'chalk'
import { WebDAVAdapter, SyncService } from '@banjuan/core'
import { openLibrary } from '../lib.js'
import { outputItem, outputTable } from '../output.js'

export const syncCmd = new Command('sync').description('同步管理')

syncCmd
  .command('config')
  .description('配置同步参数')
  .requiredOption('--url <url>', 'WebDAV 服务器地址')
  .requiredOption('--username <username>', '用户名')
  .requiredOption('--password <password>', '密码')
  .option('--remote-path <path>', '远端路径', '/banjuan')
  .action(async (opts: { url: string; username: string; password: string; remotePath: string }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      lib.saveSyncConfig({
        type: 'webdav',
        url: opts.url,
        username: opts.username,
        password: opts.password,
        remotePath: opts.remotePath,
      })
      console.log(chalk.green('✓ 同步配置已保存'))
      outputItem([
        ['类型', 'webdav'],
        ['地址', opts.url],
        ['用户名', opts.username],
        ['远端路径', opts.remotePath],
      ])
    } finally {
      await lib.close()
    }
  })

syncCmd
  .command('run')
  .description('执行双向同步')
  .action(async (_opts: unknown, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const config = lib.getSyncConfig()
      if (!config) {
        console.error(chalk.red('✗ 未配置同步，请先运行 banjuan sync config'))
        process.exit(1)
      }

      const adapter = new WebDAVAdapter()
      await adapter.connect(config)
      const svc = new SyncService(lib.rootPath, adapter, (lib as any).events)

      console.log(chalk.cyan('正在同步...'))
      let result: { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; errors: string[] }
      try {
        result = await svc.sync()
      } finally {
        await adapter.disconnect()
      }

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`⚠ 同步完成（有错误）`))
        for (const err of result.errors) {
          console.log(chalk.red(`  • ${err}`))
        }
      } else {
        console.log(chalk.green('✓ 同步完成'))
      }
      outputItem([
        ['上传', String(result.uploaded)],
        ['下载', String(result.downloaded)],
        ['本地删除', String(result.deletedLocal)],
        ['远端删除', String(result.deletedRemote)],
        ['错误数', String(result.errors.length)],
      ])
    } finally {
      await lib.close()
    }
  })

syncCmd
  .command('status')
  .description('查看同步状态与存根列表')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const config = lib.getSyncConfig()
      if (!config) {
        console.log(chalk.yellow('未配置同步。运行 banjuan sync config 来配置。'))
        return
      }

      if (!opts.json) {
        console.log(chalk.bold('同步配置：'))
        outputItem([
          ['类型', config.type],
          ['地址', config.url],
          ['用户名', config.username],
          ['远端路径', config.remotePath],
        ])
      }

      const stubSvc = lib.createStubService()
      const stubs = await stubSvc.listStubs()

      if (opts.json) {
        const { outputJson } = await import('../output.js')
        outputJson({ config, stubs })
        return
      }

      console.log()
      if (stubs.length === 0) {
        console.log('暂无存根文件')
      } else {
        console.log(chalk.bold(`存根文件（${stubs.length} 个）：`))
        outputTable(
          ['ID', '远端路径', '大小', '哈希', '创建时间'],
          stubs.map(s => [
            s.id.slice(0, 8),
            s.remotePath,
            formatBytes(s.size),
            s.hash.slice(0, 12) + '...',
            new Date(s.createdAt).toLocaleDateString('zh-CN'),
          ]),
        )
      }
    } finally {
      await lib.close()
    }
  })

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
