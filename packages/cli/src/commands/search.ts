import { Command } from 'commander'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const searchCmd = new Command('search')
  .description('搜索')
  .argument('<query>', '搜索关键词')
  .option('--type <type>', '限定类型（document|note|annotation）')
  .option('--limit <n>', '最大结果数', parseInt)
  .option('--json', 'JSON 输出')
  .action(async (query: string, opts: { type?: string; limit?: number; json?: boolean }) => {
    const params = new URLSearchParams({ q: query })
    if (opts.type) params.set('type', opts.type)
    if (opts.limit) params.set('limit', String(opts.limit))
    const results = await apiGet(`/api/search?${params}`)
    if (opts.json) {
      outputJson(results)
    } else {
      if (results.length === 0) { console.log('未找到结果'); return }
      outputTable(
        ['类型', 'ID', '标题', '片段', '评分'],
        results.map((r: any) => [
          r.type, r.id, r.title,
          (r.snippet ?? '').slice(0, 40), (r.score ?? 0).toFixed(2),
        ]),
      )
    }
  })
