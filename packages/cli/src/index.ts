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
  .description('Banjuan — study & research toolkit')
  .version('0.1.0')
  .option('--library <path>', 'path to the library to operate on')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts()
    if (opts.library) setLibraryOption(resolve(opts.library))
  })

program
  .command('status')
  .description('show connection status and open libraries')
  .action(async () => {
    if (!isAppRunning()) {
      console.log(chalk.gray('Banjuan is not running'))
      return
    }
    const status = await apiGet('/api/status')
    console.log(chalk.green('✓ Banjuan is running'))
    const libs: string[] = status.libraries ?? []
    if (libs.length === 0) {
      console.log(chalk.yellow('  No library is open'))
    } else {
      for (const p of libs) {
        const marker = p === status.activeLibrary ? chalk.green(' (active)') : ''
        console.log(`  ${chalk.cyan('•')} ${p}${marker}`)
      }
    }
  })

program
  .command('start')
  .description('start the desktop app')
  .action(async () => {
    if (isAppRunning()) {
      console.log(chalk.green('✓ Banjuan is already running'))
      return
    }
    await ensureApp()
    console.log(chalk.green('✓ Banjuan started'))
  })

program
  .command('stop')
  .description('stop the desktop app')
  .action(async () => {
    if (!isAppRunning()) {
      console.log(chalk.gray('Banjuan is not running'))
      return
    }
    await apiPost('/api/app/quit')
    console.log(chalk.green('✓ Banjuan stopped'))
  })

program
  .command('init')
  .description('create a new library')
  .argument('<path>', 'library path')
  .option('--name <name>', 'library name (defaults to directory name)')
  .action(async (path: string, opts: { name?: string }) => {
    const result = await apiPost('/api/library/init', { path: resolve(path), name: opts.name })
    console.log(chalk.green(`✓ Library created: ${result.name ?? result.path}`))
  })

program
  .command('open')
  .description('open a library')
  .argument('<path>', 'library path')
  .action(async (path: string) => {
    const result = await apiPost('/api/library/open', { path: resolve(path) })
    console.log(chalk.green(`✓ Library opened: ${result.name ?? result.path}`))
  })

program
  .command('close')
  .description('close a library')
  .argument('[path]', 'library path (closes active library if omitted)')
  .action(async (path?: string) => {
    const result = await apiPost('/api/library/close', { path: path ? resolve(path) : undefined })
    if (result.status === 'not_found') {
      console.log(chalk.yellow('Library not found'))
    } else {
      console.log(chalk.green('✓ Library closed'))
    }
  })

program
  .command('list')
  .description('list open libraries')
  .action(async () => {
    const libs = await apiGet('/api/library/list')
    if (libs.length === 0) {
      console.log(chalk.gray('No libraries are open'))
    } else {
      for (const lib of libs) {
        console.log(`${chalk.cyan('•')} ${lib.path}`)
      }
    }
  })

program
  .command('use')
  .description('switch the active library')
  .argument('<path>', 'library path')
  .action(async (path: string) => {
    const result = await apiPost('/api/library/active', { path: resolve(path) })
    console.log(chalk.green(`✓ Switched to library: ${result.path}`))
  })

program
  .command('history')
  .description('show library history')
  .action(() => {
    const history = readLibraryHistory()
    if (history.length === 0) {
      console.log(chalk.gray('No history'))
    } else {
      for (const h of history) {
        const date = new Date(h.lastOpened).toLocaleString()
        console.log(`${chalk.cyan('•')} ${h.name ?? h.path}`)
        console.log(`  ${chalk.gray(h.path)}`)
        console.log(`  ${chalk.gray(`Last opened: ${date}`)}`)
      }
    }
  })

program
  .command('install-skill')
  .description('install AI assistant skill (for Claude Code, etc.)')
  .option('--local', 'install to current project .claude/skills/')
  .option('--global', 'install globally to ~/.claude/skills/')
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
      console.log(chalk.red('✗ Skill file not found'))
      return
    }

    const target = opts.local
      ? resolve('.claude', 'skills', 'banjuan')
      : resolve(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'skills', 'banjuan')
    mkdirSync(target, { recursive: true })
    cpSync(skillFile, resolve(target, 'SKILL.md'))
    const label = opts.local ? 'project' : 'global'
    console.log(chalk.green(`✓ Installed to ${label}: ${target}/SKILL.md`))
    console.log(chalk.gray('  Use /banjuan in Claude Code to get started'))
  })

program
  .command('uninstall-skill')
  .description('uninstall AI assistant skill')
  .option('--local', 'uninstall from current project')
  .option('--global', 'uninstall from global')
  .action((opts: { local?: boolean; global?: boolean }) => {
    const targets: Array<{ dir: string; label: string }> = []
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const globalDir = resolve(home, '.claude', 'skills', 'banjuan')
    const localDir = resolve('.claude', 'skills', 'banjuan')

    if (opts.local) {
      targets.push({ dir: localDir, label: 'project' })
    } else if (opts.global) {
      targets.push({ dir: globalDir, label: 'global' })
    } else {
      if (existsSync(localDir)) targets.push({ dir: localDir, label: 'project' })
      if (existsSync(globalDir)) targets.push({ dir: globalDir, label: 'global' })
    }

    if (targets.length === 0) {
      console.log(chalk.gray('No installed skill found'))
      return
    }
    for (const { dir, label } of targets) {
      rmSync(dir, { recursive: true })
      console.log(chalk.green(`✓ Uninstalled from ${label}: ${dir}`))
    }
  })

program
  .command('uninstall')
  .description('uninstall Banjuan (CLI, skill, config, and app)')
  .option('--keep-data', 'keep ~/.banjuan/ config and history')
  .action(async (opts: { keepData?: boolean }) => {
    if (isAppRunning()) {
      await apiPost('/api/app/quit').catch(() => {})
      console.log(chalk.green('✓ Banjuan stopped'))
      await new Promise(r => setTimeout(r, 1000))
    }

    const home = process.env.HOME || ''

    const symlinks = ['/usr/local/bin/banjuan', '/opt/homebrew/bin/banjuan', resolve(home, '.local', 'bin', 'banjuan')]
    for (const symlink of symlinks) {
      try {
        if (existsSync(symlink)) {
          rmSync(symlink)
          console.log(chalk.green(`✓ Removed ${symlink}`))
        }
      } catch {
        console.log(chalk.yellow(`⚠ Cannot remove ${symlink}, run manually: sudo rm ${symlink}`))
      }
    }

    const globalPkg = '/opt/homebrew/lib/node_modules/@banjuan/cli'
    if (existsSync(globalPkg)) {
      try {
        rmSync(globalPkg, { recursive: true })
        console.log(chalk.green('✓ Removed global npm package'))
      } catch {
        console.log(chalk.yellow('⚠ Cannot remove global npm package, run manually: npm uninstall -g @banjuan/cli'))
      }
    }

    const skillDirs = [
      resolve(home, '.claude', 'skills', 'banjuan'),
      resolve('.claude', 'skills', 'banjuan'),
    ]
    for (const dir of skillDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true })
        console.log(chalk.green(`✓ Removed skill: ${dir}`))
      }
    }

    if (!opts.keepData) {
      const banjuanDir = resolve(home, '.banjuan')
      if (existsSync(banjuanDir)) {
        rmSync(banjuanDir, { recursive: true })
        console.log(chalk.green(`✓ Removed config: ${banjuanDir}`))
      }
    }

    const appPath = '/Applications/半卷.app'
    if (existsSync(appPath)) {
      try {
        rmSync(appPath, { recursive: true })
        console.log(chalk.green(`✓ Removed app: ${appPath}`))
      } catch {
        console.log(chalk.yellow(`⚠ Cannot remove ${appPath}, please delete manually`))
      }
    }

    console.log(chalk.green('\n✓ Uninstall complete'))
  })

program.addCommand(docCmd)
program.addCommand(annCmd)
program.addCommand(noteCmd)
program.addCommand(mindmapCmd)
program.addCommand(searchCmd)
program.addCommand(tagCmd)
program.addCommand(folderCmd)

program.parse()
