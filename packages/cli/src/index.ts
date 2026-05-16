#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { resolve, dirname } from 'node:path'
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apiGet, apiPost, isAppRunning, ensureApp, readLibraryHistory, setLibraryOption } from './lib.js'
import { docCmd } from './commands/doc.js'
import { annCmd } from './commands/ann.js'
import { noteCmd } from './commands/note.js'
import { mindmapCmd } from './commands/mindmap.js'
import { searchCmd } from './commands/search.js'
import { tagCmd } from './commands/tag.js'
import { folderCmd } from './commands/folder.js'

const program = new Command()
  .name('banjuan')
  .description('半卷闲书 — 学习与研究工具')
  .version('0.1.0')
  .option('--library <path>', '指定操作的书房路径')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts()
    if (opts.library) setLibraryOption(resolve(opts.library))
  })

program
  .command('status')
  .description('查看连接状态和已打开的书房')
  .action(async () => {
    if (!isAppRunning()) {
      console.log(chalk.gray('半卷闲书未运行'))
      return
    }
    const status = await apiGet('/api/status')
    console.log(chalk.green('✓ 半卷闲书运行中'))
    const libs: string[] = status.libraries ?? []
    if (libs.length === 0) {
      console.log(chalk.yellow('  尚未打开书房'))
    } else {
      for (const p of libs) {
        const marker = p === status.activeLibrary ? chalk.green(' (当前)') : ''
        console.log(`  ${chalk.cyan('•')} ${p}${marker}`)
      }
    }
  })

program
  .command('start')
  .description('启动桌面应用')
  .action(async () => {
    if (isAppRunning()) {
      console.log(chalk.green('✓ 半卷闲书已在运行'))
      return
    }
    await ensureApp()
    console.log(chalk.green('✓ 半卷闲书已启动'))
  })

program
  .command('stop')
  .description('关闭桌面应用')
  .action(async () => {
    if (!isAppRunning()) {
      console.log(chalk.gray('半卷闲书未运行'))
      return
    }
    await apiPost('/api/app/quit')
    console.log(chalk.green('✓ 半卷闲书已关闭'))
  })

program
  .command('init')
  .description('创建新书房')
  .argument('<path>', '书房路径')
  .option('--name <name>', '书房名称（默认使用目录名）')
  .action(async (path: string, opts: { name?: string }) => {
    const result = await apiPost('/api/library/init', { path: resolve(path), name: opts.name })
    console.log(chalk.green(`✓ 已创建书房：${result.name ?? result.path}`))
  })

program
  .command('open')
  .description('打开书房')
  .argument('<path>', '书房路径')
  .action(async (path: string) => {
    const result = await apiPost('/api/library/open', { path: resolve(path) })
    console.log(chalk.green(`✓ 已打开书房：${result.name ?? result.path}`))
  })

program
  .command('close')
  .description('关闭书房')
  .argument('[path]', '书房路径（不指定则关闭当前书房）')
  .action(async (path?: string) => {
    const result = await apiPost('/api/library/close', { path: path ? resolve(path) : undefined })
    if (result.status === 'not_found') {
      console.log(chalk.yellow('未找到该书房'))
    } else {
      console.log(chalk.green('✓ 书房已关闭'))
    }
  })

program
  .command('list')
  .description('列出已打开的书房')
  .action(async () => {
    const libs = await apiGet('/api/library/list')
    if (libs.length === 0) {
      console.log(chalk.gray('暂无打开的书房'))
    } else {
      for (const lib of libs) {
        console.log(`${chalk.cyan('•')} ${lib.path}`)
      }
    }
  })

program
  .command('use')
  .description('切换当前激活的书房')
  .argument('<path>', '书房路径')
  .action(async (path: string) => {
    const result = await apiPost('/api/library/active', { path: resolve(path) })
    console.log(chalk.green(`✓ 已切换到书房：${result.path}`))
  })

program
  .command('history')
  .description('查看历史打开过的书房')
  .action(() => {
    const history = readLibraryHistory()
    if (history.length === 0) {
      console.log(chalk.gray('暂无历史记录'))
    } else {
      for (const h of history) {
        const date = new Date(h.lastOpened).toLocaleString()
        console.log(`${chalk.cyan('•')} ${h.name ?? h.path}`)
        console.log(`  ${chalk.gray(h.path)}`)
        console.log(`  ${chalk.gray(`最后打开: ${date}`)}`)
      }
    }
  })

program
  .command('install-skill')
  .description('安装 AI 助手 skill（Claude Code 等）')
  .option('--local', '安装到当前项目 .claude/skills/')
  .option('--global', '安装到全局 ~/.claude/skills/')
  .action((opts: { local?: boolean; global?: boolean }) => {
    const cliDir = dirname(fileURLToPath(import.meta.url))
    const candidates = [
      resolve(cliDir, '..', 'skill', 'banjuan', 'SKILL.md'),
      resolve(cliDir, '..', 'banjuan', 'SKILL.md'),
      resolve(cliDir, '..', '..', 'skill', 'banjuan', 'SKILL.md'),
      resolve(cliDir, '..', '..', 'banjuan', 'SKILL.md'),
    ]
    const skillFile = candidates.find(f => existsSync(f))
    if (!skillFile) {
      console.log(chalk.red('✗ 未找到 skill 文件'))
      return
    }

    const target = opts.local
      ? resolve('.claude', 'skills', 'banjuan')
      : resolve(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'skills', 'banjuan')
    mkdirSync(target, { recursive: true })
    cpSync(skillFile, resolve(target, 'SKILL.md'))
    const label = opts.local ? '当前项目' : '全局'
    console.log(chalk.green(`✓ 已安装到${label}：${target}/SKILL.md`))
    console.log(chalk.gray('  在 Claude Code 中输入 /banjuan 即可使用'))
  })

program
  .command('uninstall-skill')
  .description('卸载 AI 助手 skill')
  .option('--local', '从当前项目卸载')
  .option('--global', '从全局卸载')
  .action((opts: { local?: boolean; global?: boolean }) => {
    const targets: Array<{ dir: string; label: string }> = []
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const globalDir = resolve(home, '.claude', 'skills', 'banjuan')
    const localDir = resolve('.claude', 'skills', 'banjuan')

    if (opts.local) {
      targets.push({ dir: localDir, label: '当前项目' })
    } else if (opts.global) {
      targets.push({ dir: globalDir, label: '全局' })
    } else {
      if (existsSync(localDir)) targets.push({ dir: localDir, label: '当前项目' })
      if (existsSync(globalDir)) targets.push({ dir: globalDir, label: '全局' })
    }

    if (targets.length === 0) {
      console.log(chalk.gray('未找到已安装的 skill'))
      return
    }
    for (const { dir, label } of targets) {
      rmSync(dir, { recursive: true })
      console.log(chalk.green(`✓ 已从${label}卸载：${dir}`))
    }
  })

program
  .command('uninstall')
  .description('卸载半卷闲书（清理 CLI、skill、配置文件，并删除 app）')
  .option('--keep-data', '保留 ~/.banjuan/ 配置和历史数据')
  .action(async (opts: { keepData?: boolean }) => {
    if (isAppRunning()) {
      await apiPost('/api/app/quit').catch(() => {})
      console.log(chalk.green('✓ 已关闭半卷闲书'))
      await new Promise(r => setTimeout(r, 1000))
    }

    const home = process.env.HOME || ''

    // Remove CLI symlinks
    const symlinks = ['/usr/local/bin/banjuan', '/opt/homebrew/bin/banjuan']
    for (const symlink of symlinks) {
      try {
        if (existsSync(symlink)) {
          rmSync(symlink)
          console.log(chalk.green(`✓ 已删除 ${symlink}`))
        }
      } catch {
        console.log(chalk.yellow(`⚠ 无法删除 ${symlink}，请手动运行: sudo rm ${symlink}`))
      }
    }

    // Remove global npm package
    const globalPkg = '/opt/homebrew/lib/node_modules/@banjuan/cli'
    if (existsSync(globalPkg)) {
      try {
        rmSync(globalPkg, { recursive: true })
        console.log(chalk.green('✓ 已删除全局 npm 包'))
      } catch {
        console.log(chalk.yellow('⚠ 无法删除全局 npm 包，请手动运行: npm uninstall -g @banjuan/cli'))
      }
    }

    // Remove skill
    const skillDirs = [
      resolve(home, '.claude', 'skills', 'banjuan'),
      resolve('.claude', 'skills', 'banjuan'),
    ]
    for (const dir of skillDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true })
        console.log(chalk.green(`✓ 已删除 skill：${dir}`))
      }
    }

    // Remove config
    if (!opts.keepData) {
      const banjuanDir = resolve(home, '.banjuan')
      if (existsSync(banjuanDir)) {
        rmSync(banjuanDir, { recursive: true })
        console.log(chalk.green(`✓ 已删除配置：${banjuanDir}`))
      }
    }

    // Remove app
    const appPath = '/Applications/半卷.app'
    if (existsSync(appPath)) {
      try {
        rmSync(appPath, { recursive: true })
        console.log(chalk.green(`✓ 已删除应用：${appPath}`))
      } catch {
        console.log(chalk.yellow(`⚠ 无法删除 ${appPath}，请手动删除`))
      }
    }

    console.log(chalk.green('\n✓ 卸载完成'))
  })

program.addCommand(docCmd)
program.addCommand(annCmd)
program.addCommand(noteCmd)
program.addCommand(mindmapCmd)
program.addCommand(searchCmd)
program.addCommand(tagCmd)
program.addCommand(folderCmd)

program.parse()
