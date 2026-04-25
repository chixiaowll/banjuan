import { Command } from 'commander'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const pluginCmd = new Command('plugin').description('插件管理')

pluginCmd
  .command('list')
  .description('列出已加载插件')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      await lib.plugins.loadAll()
      const plugins = lib.plugins.list()
      if (opts.json) {
        outputJson(plugins)
      } else {
        if (plugins.length === 0) { console.log('暂无插件'); return }
        outputTable(
          ['ID', '名称', '版本', '描述'],
          plugins.map(p => [p.id, p.name, p.version, p.description]),
        )
      }
    } finally {
      await lib.close()
    }
  })

pluginCmd
  .command('run')
  .description('运行插件命令')
  .argument('<command-id>', '命令 ID（格式：pluginId:commandId）')
  .action(async (commandId: string, _opts: unknown, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      await lib.plugins.loadAll()
      await lib.plugins.runCommand(commandId)
    } finally {
      await lib.close()
    }
  })
