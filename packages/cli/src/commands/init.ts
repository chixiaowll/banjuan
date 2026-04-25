import { Command } from 'commander'
import { Library } from '@banjuan/core'
import { resolve } from 'node:path'
import chalk from 'chalk'

export const initCmd = new Command('init')
  .description('在当前目录创建书房')
  .argument('[path]', '书房路径', '.')
  .action((path: string) => {
    const fullPath = resolve(path)
    try {
      const lib = Library.init(fullPath)
      lib.close()
      console.log(chalk.green(`✓ 书房已创建：${fullPath}`))
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })
