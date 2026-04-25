import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

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
