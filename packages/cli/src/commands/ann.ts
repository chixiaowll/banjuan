import { Command } from 'commander'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const annCmd = new Command('ann').description('annotation management')

annCmd
  .command('list')
  .description('list annotations')
  .argument('<doc-id>', 'document ID')
  .option('--page <n>', 'filter by page number', parseInt)
  .option('--json', 'JSON output')
  .action(async (docId: string, opts: { page?: number; json?: boolean }) => {
    const params = new URLSearchParams({ docId })
    if (opts.page != null) params.set('page', String(opts.page))
    const anns = await apiGet(`/api/annotations?${params}`)
    if (opts.json) {
      outputJson(anns)
    } else {
      if (anns.length === 0) { console.log('No annotations'); return }
      outputTable(
        ['ID', 'Type', 'Page', 'Text', 'Color'],
        anns.map((a: any) => [
          a.id, a.type,
          a.page?.toString() ?? '-',
          (a.selectedText ?? '').slice(0, 30),
          a.color,
        ]),
      )
    }
  })
