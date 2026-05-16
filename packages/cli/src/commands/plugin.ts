import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const pluginCmd = new Command('plugin').description('插件管理')

pluginCmd
  .command('list')
  .description('列出已加载插件')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }) => {
    console.log(chalk.yellow('插件管理需要通过桌面应用操作'))
  })
