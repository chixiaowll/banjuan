import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiDelete } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const tagCmd = new Command('tag').description('tag management')

tagCmd
  .command('list')
  .description('list all tags')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const tags = await apiGet('/api/tags')
    if (opts.json) {
      outputJson(tags)
    } else {
      if (tags.length === 0) { console.log('No tags'); return }
      outputTable(
        ['ID', 'Name', 'Color'],
        tags.map((t: any) => [t.id, t.name, t.color ?? '-']),
      )
    }
  })

tagCmd
  .command('assign')
  .description('assign a tag')
  .argument('<target-id>', 'target ID')
  .argument('<target-type>', 'target type (document|note)')
  .argument('<tag-name>', 'tag name')
  .action(async (targetId: string, targetType: string, tagName: string) => {
    const tags = await apiGet('/api/tags')
    const existing = tags.find((t: any) => t.name === tagName)
    if (!existing) await apiPost('/api/tags', { name: tagName })
    await apiPost('/api/tags/assign', { targetId, targetType, tags: [tagName] })
    console.log(chalk.green(`✓ Assigned tag "${tagName}"`))
  })

tagCmd
  .command('unassign')
  .description('remove a tag')
  .argument('<target-id>', 'target ID')
  .argument('<target-type>', 'target type (document|note)')
  .argument('<tag-name>', 'tag name')
  .action(async (targetId: string, targetType: string, tagName: string) => {
    await apiPost('/api/tags/unassign', { targetId, targetType, tagName })
    console.log(chalk.green(`✓ Removed tag "${tagName}"`))
  })

tagCmd
  .command('delete')
  .description('delete a tag')
  .argument('<id>', 'tag ID')
  .action(async (id: string) => {
    await apiDelete(`/api/tags/${encodeURIComponent(id)}`)
    console.log(chalk.green('✓ Tag deleted'))
  })
