import { Command } from 'commander'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const annCmd = new Command('ann').description('标注管理')

annCmd
  .command('list')
  .description('列出标注')
  .argument('<doc-id>', '文档 ID')
  .option('--page <n>', '按页码筛选', parseInt)
  .option('--json', 'JSON 输出')
  .action(async (docId: string, opts: { page?: number; json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const anns = await lib.annotations.list({ docId, page: opts.page })
      if (opts.json) {
        outputJson(anns)
      } else {
        if (anns.length === 0) { console.log('暂无标注'); return }
        outputTable(
          ['ID', '类型', '页', '文本', '颜色'],
          anns.map(a => [
            a.id.slice(0, 8), a.type,
            a.page?.toString() ?? '-',
            (a.selectedText ?? '').slice(0, 30),
            a.color,
          ]),
        )
      }
    } finally {
      await lib.close()
    }
  })
