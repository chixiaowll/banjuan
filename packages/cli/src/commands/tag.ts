import { Command } from 'commander'
import chalk from 'chalk'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const tagCmd = new Command('tag').description('标签管理')

tagCmd
  .command('list')
  .description('列出所有标签')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const tags = await lib.tags.list()
      if (opts.json) {
        outputJson(tags)
      } else {
        if (tags.length === 0) { console.log('暂无标签'); return }
        outputTable(
          ['ID', '名称', '颜色'],
          tags.map(t => [t.id.slice(0, 8), t.name, t.color ?? '-']),
        )
      }
    } finally {
      await lib.close()
    }
  })

tagCmd
  .command('assign')
  .description('分配标签')
  .argument('<target-id>', '目标 ID')
  .argument('<target-type>', '目标类型（document|note）')
  .argument('<tag-name>', '标签名')
  .action(async (targetId: string, targetType: string, tagName: string, _opts: unknown, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const existing = (await lib.tags.list()).find(t => t.name === tagName)
      if (!existing) await lib.tags.create({ name: tagName })
      await lib.tags.assign(targetId, targetType as any, [tagName])
      console.log(chalk.green(`✓ 已添加标签 "${tagName}"`))
    } finally {
      await lib.close()
    }
  })
