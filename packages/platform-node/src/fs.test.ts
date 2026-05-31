import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from './fs.js'

describe('NodeFS.setMtime', () => {
  it('sets a file mtime to the given epoch-ms value', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nodefs-'))
    const f = join(dir, 'a.txt')
    writeFileSync(f, 'hi')
    const fs = new NodeFS()
    const target = 1_700_000_000_000  // 2023-11-14T...
    await fs.setMtime(f, target)
    // Filesystems may round to the nearest second; allow ±1s.
    expect(Math.abs(statSync(f).mtimeMs - target)).toBeLessThanOrEqual(1000)
  })
})
