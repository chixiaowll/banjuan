import { Command } from 'commander'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const searchCmd = new Command('search')
  .description('search')
  .argument('<query>', 'search keywords')
  .option('--type <type>', 'limit type (document|note|annotation)')
  .option('--limit <n>', 'max results', parseInt)
  .option('--json', 'JSON output')
  .action(async (query: string, opts: { type?: string; limit?: number; json?: boolean }) => {
    const params = new URLSearchParams({ q: query })
    if (opts.type) params.set('type', opts.type)
    if (opts.limit) params.set('limit', String(opts.limit))
    const results = await apiGet(`/api/search?${params}`)
    if (opts.json) {
      outputJson(results)
    } else {
      if (results.length === 0) { console.log('No results'); return }
      outputTable(
        ['Type', 'ID', 'Title', 'Snippet', 'Score'],
        results.map((r: any) => [
          r.type, r.id, r.title,
          (r.snippet ?? '').slice(0, 40), (r.score ?? 0).toFixed(2),
        ]),
      )
    }
  })
