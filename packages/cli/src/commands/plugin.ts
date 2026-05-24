import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const pluginCmd = new Command('plugin').description('plugin management')

pluginCmd
  .command('list')
  .description('list loaded plugins')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    console.log(chalk.yellow('Plugin management requires the desktop app'))
  })
