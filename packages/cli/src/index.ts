#!/usr/bin/env node
import { Command } from 'commander'
import { initCmd } from './commands/init.js'
import { docCmd } from './commands/doc.js'
import { annCmd } from './commands/ann.js'
import { noteCmd } from './commands/note.js'
import { mindmapCmd } from './commands/mindmap.js'

const program = new Command()
  .name('banjuan')
  .description('半卷闲书 — 学习与研究工具')
  .version('0.1.0')
  .option('--library <path>', '指定书房路径（默认当前目录）')

program.addCommand(initCmd)
program.addCommand(docCmd)
program.addCommand(annCmd)
program.addCommand(noteCmd)
program.addCommand(mindmapCmd)

program.parse()
