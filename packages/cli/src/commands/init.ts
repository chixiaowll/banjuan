import { Command } from 'commander'
import chalk from 'chalk'

export const initCmd = new Command('init')
  .description('create a library in the current directory')
  .argument('[path]', 'library path', '.')
  .action((_path: string) => {
    console.log(chalk.yellow('Please create a library via the desktop app'))
  })
