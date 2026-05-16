#!/usr/bin/env node
// Bundle CLI into resources/cli-bundle/ for electron-builder
// Resolves pnpm symlinks by copying real files

import { cpSync, rmSync, mkdirSync, existsSync, realpathSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = join(__dirname, '..')
const cliDir = join(appDir, '..', 'cli')
const rootDir = join(appDir, '..', '..')
const outDir = join(appDir, 'resources', 'cli-bundle')

// Build CLI
console.log('Building CLI...')
execSync('pnpm --filter @banjuan/cli build', { cwd: rootDir, stdio: 'inherit' })

// Clean & create output
if (existsSync(outDir)) rmSync(outDir, { recursive: true })
mkdirSync(outDir, { recursive: true })

// Copy launcher script
cpSync(join(appDir, 'resources', 'cli', 'banjuan-cli'), join(outDir, 'banjuan-cli'))

// Copy dist (compiled JS only)
cpSync(join(cliDir, 'dist'), join(outDir, 'dist'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map') && !src.endsWith('.d.ts') && !src.endsWith('.d.ts.map'),
})

// Recursively collect all dependencies
const vendorDir = join(outDir, 'vendor')
mkdirSync(vendorDir, { recursive: true })

const collected = new Set()
function collectDep(pkg) {
  if (collected.has(pkg)) return
  collected.add(pkg)

  // Try multiple locations (pnpm hoists differently)
  const candidates = [
    join(cliDir, 'node_modules', pkg),
    join(rootDir, 'node_modules', pkg),
  ]
  for (const candidate of candidates) {
    try {
      const realPath = realpathSync(candidate)
      cpSync(realPath, join(vendorDir, pkg), { recursive: true })
      // Recurse into sub-dependencies
      const pkgJson = JSON.parse(readFileSync(join(realPath, 'package.json'), 'utf-8'))
      for (const sub of Object.keys(pkgJson.dependencies || {})) {
        collectDep(sub)
      }
      return
    } catch {}
  }
  console.warn(`Warning: dependency "${pkg}" not found`)
}

for (const dep of ['commander', 'chalk', 'cli-table3']) {
  collectDep(dep)
}
console.log(`Collected ${collected.size} dependencies: ${[...collected].join(', ')}`)

// Copy skill directory and install script
cpSync(join(cliDir, 'skill', 'banjuan'), join(outDir, 'banjuan'), { recursive: true })
cpSync(join(cliDir, 'install-skill.sh'), join(outDir, 'install-skill.sh'))

console.log(`CLI bundled to ${outDir}`)
