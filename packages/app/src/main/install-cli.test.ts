import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, symlinkSync, readlinkSync, readFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({ app: {} }))
const { trySymlink } = await import('./install-cli.js')

describe('trySymlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-'))
  const cli = join(dir, 'banjuan-cli'); writeFileSync(cli, '#!/bin/sh')

  it('replaces a dangling link left by an older install', () => {
    const target = join(dir, 'a')
    symlinkSync(join(dir, 'gone', 'banjuan-cli'), target)
    expect(trySymlink(cli, target)).toBe(true)
    expect(readlinkSync(target)).toBe(cli)
  })

  it('repoints a link to another copy, keeps a correct one', () => {
    const target = join(dir, 'b')
    symlinkSync(join(dir, 'other'), target)
    expect(trySymlink(cli, target)).toBe(true)
    expect(readlinkSync(target)).toBe(cli)
    expect(trySymlink(cli, target)).toBe(true)
  })

  it('leaves someone else’s regular file alone', () => {
    const target = join(dir, 'c')
    writeFileSync(target, 'theirs')
    expect(trySymlink(cli, target)).toBe(false)
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('theirs')
  })
})
