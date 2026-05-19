import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiDelete } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const tagCmd = new Command('tag').description('标签管理')

tagCmd
  .command('list')
  .description('列出所有标签')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }) => {
    const tags = await apiGet('/api/tags')
    if (opts.json) {
      outputJson(tags)
    } else {
      if (tags.length === 0) { console.log('暂无标签'); return }
      outputTable(
        ['ID', '名称', '颜色'],
        tags.map((t: any) => [t.id, t.name, t.color ?? '-']),
      )
    }
  })

tagCmd
  .command('assign')
  .description('分配标签')
  .argument('<target-id>', '目标 ID')
  .argument('<target-type>', '目标类型（document|note）')
  .argument('<tag-name>', '标签名')
  .action(async (targetId: string, targetType: string, tagName: string) => {
    const tags = await apiGet('/api/tags')
    const existing = tags.find((t: any) => t.name === tagName)
    if (!existing) await apiPost('/api/tags', { name: tagName })
    await apiPost('/api/tags/assign', { targetId, targetType, tags: [tagName] })
    console.log(chalk.green(`✓ 已添加标签 "${tagName}"`))
  })

tagCmd
  .command('unassign')
  .description('移除标签')
  .argument('<target-id>', '目标 ID')
  .argument('<target-type>', '目标类型（document|note）')
  .argument('<tag-name>', '标签名')
  .action(async (targetId: string, targetType: string, tagName: string) => {
    await apiPost('/api/tags/unassign', { targetId, targetType, tagName })
    console.log(chalk.green(`✓ 已移除标签 "${tagName}"`))
  })

tagCmd
  .command('delete')
  .description('删除标签')
  .argument('<id>', '标签 ID')
  .action(async (id: string) => {
    await apiDelete(`/api/tags/${encodeURIComponent(id)}`)
    console.log(chalk.green('✓ 已删除标签'))
  })
