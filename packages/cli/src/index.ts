#!/usr/bin/env node
import { Command } from 'commander'
import { initCmd } from './commands/init.js'
import { docCmd } from './commands/doc.js'

const program = new Command()
  .name('banjuan')
  .description('半卷闲书 — 学习与研究工具')
  .version('0.1.0')
  .option('--library <path>', '指定书房路径（默认当前目录）')

program.addCommand(initCmd)
program.addCommand(docCmd)

program.parse()
