#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
  .name('banjuan')
  .description('半卷闲书 — 学习与研究工具')
  .version('0.1.0')
  .option('--library <path>', '指定书房路径（默认当前目录）')

program.parse()
