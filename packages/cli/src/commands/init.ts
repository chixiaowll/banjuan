import { Command } from 'commander'
import chalk from 'chalk'

export const initCmd = new Command('init')
  .description('在当前目录创建书房')
  .argument('[path]', '书房路径', '.')
  .action((_path: string) => {
    console.log(chalk.yellow('请通过桌面应用创建书房'))
  })
