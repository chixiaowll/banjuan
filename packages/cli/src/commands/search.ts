import { Command } from 'commander'
import type { SearchResult } from '@banjuan/core'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const searchCmd = new Command('search')
  .description('搜索')
  .argument('<query>', '搜索关键词')
  .option('--type <type>', '限定类型（document|note|annotation）')
  .option('--json', 'JSON 输出')
  .action(async (query: string, opts: { type?: string; json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const results = await lib.search.query(query, { type: opts.type as any })
      if (opts.json) {
        outputJson(results)
      } else {
        if (results.length === 0) { console.log('未找到结果'); return }
        outputTable(
          ['类型', 'ID', '标题', '片段', '评分'],
          results.map((r: SearchResult) => [
            r.type, r.id.slice(0, 8), r.title,
            r.snippet.slice(0, 40), r.score.toFixed(2),
          ]),
        )
      }
    } finally {
      await lib.close()
    }
  })
