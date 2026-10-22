import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import type { PlatformDeps } from '../src/platform/index.js'

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'banjuan-test-'))
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export function createTestFile(libPath: string, relativePath: string, content?: string | Buffer): string {
  const fullPath = join(libPath, relativePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content ?? 'test content')
  return fullPath
}

/** Platform deps for Library.init/open in tests (Node fs + better-sqlite3). */
export function testDeps(overrides: Partial<PlatformDeps> = {}): PlatformDeps {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), ...overrides }
}
