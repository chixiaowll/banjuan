#!/usr/bin/env node
// Run vitest inside Electron's bundled Node (ELECTRON_RUN_AS_NODE). The app's
// postinstall rebuilds the workspace's single better-sqlite3 for Electron's ABI,
// so plain Node can't load it in packages that touch the database.
// Usage (from a package dir): node ../../scripts/vitest-electron.mjs [vitest args]
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electron = createRequire(join(root, 'packages/app/package.json'))('electron')   // binary path
const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs')
const args = process.argv.slice(2)
const r = spawnSync(electron, [vitest, ...(args[0] === 'watch' ? args : ['run', ...args])], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
process.exit(r.status ?? 1)
