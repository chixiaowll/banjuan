import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'banjuan-test-'))
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
