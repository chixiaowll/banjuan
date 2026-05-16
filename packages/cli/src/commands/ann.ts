import { Command } from 'commander'
import { apiGet } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const annCmd = new Command('ann').description('标注管理')

annCmd
  .command('list')
  .description('列出标注')
  .argument('<doc-id>', '文档 ID')
  .option('--page <n>', '按页码筛选', parseInt)
  .option('--json', 'JSON 输出')
  .action(async (docId: string, opts: { page?: number; json?: boolean }) => {
    const params = new URLSearchParams({ docId })
    if (opts.page != null) params.set('page', String(opts.page))
    const anns = await apiGet(`/api/annotations?${params}`)
    if (opts.json) {
      outputJson(anns)
    } else {
      if (anns.length === 0) { console.log('暂无标注'); return }
      outputTable(
        ['ID', '类型', '页', '文本', '颜色'],
        anns.map((a: any) => [
          a.id, a.type,
          a.page?.toString() ?? '-',
          (a.selectedText ?? '').slice(0, 30),
          a.color,
        ]),
      )
    }
  })
