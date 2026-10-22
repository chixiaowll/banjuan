import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, statSync, readFileSync, readdirSync } from 'node:fs'
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

describe('NodeFS writes are atomic', () => {
  const dirFiles = (dir: string) => readdirSync(dir).sort()

  it('writes the content and leaves no temp file behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nodefs-'))
    const f = join(dir, 'note.json')
    const fs = new NodeFS()
    await fs.writeTextFile(f, '{"a":1}')
    await fs.writeTextFile(f, '{"a":2,"中文":"内容"}')
    expect(readFileSync(f, 'utf-8')).toBe('{"a":2,"中文":"内容"}')
    await fs.writeFile(join(dir, 'b.bin'), new Uint8Array([1, 2, 3]))
    expect(Array.from(readFileSync(join(dir, 'b.bin')))).toEqual([1, 2, 3])
    expect(dirFiles(dir)).toEqual(['b.bin', 'note.json'])
  })

  it('keeps the original intact and cleans up when the write fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nodefs-'))
    const f = join(dir, 'note.json')
    writeFileSync(f, '{"ok":true}')
    const fs = new NodeFS()
    await expect(fs.writeTextFile(f, Symbol('not writable') as any)).rejects.toThrow()
    expect(readFileSync(f, 'utf-8')).toBe('{"ok":true}')
    expect(dirFiles(dir)).toEqual(['note.json'])
  })

  it('creates missing parent directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nodefs-'))
    const f = join(dir, 'a', 'b', 'c.json')
    await new NodeFS().writeTextFile(f, '{}')
    expect(readFileSync(f, 'utf-8')).toBe('{}')
  })
})
