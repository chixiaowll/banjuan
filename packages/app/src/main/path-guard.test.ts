import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const shellMock = vi.hoisted(() => ({ openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }))
vi.mock('electron', () => ({ shell: shellMock }))

import { isInside, libraryPath, rememberPickedDir, exportDir, rememberUserChosenPath, assertUserChosen, openPathSafely } from './path-guard.js'

describe('path guard', () => {
  it('keeps library paths inside the library', () => {
    expect(libraryPath('/lib', 'Books/a.pdf')).toBe('/lib/Books/a.pdf')
    expect(() => libraryPath('/lib', '../etc/passwd')).toThrow()
    expect(() => libraryPath('/lib', '/etc/passwd')).toThrow()
    expect(() => libraryPath('/lib', 'a/../../x')).toThrow()
    expect(isInside('/lib', '/lib2/x')).toBe(false)
  })

  it('exports only into folders the user picked', () => {
    expect(() => exportDir('/Users/x/Desktop')).toThrow()
    rememberPickedDir('/Users/x/Exports')
    expect(exportDir('/Users/x/Exports/读书/sub')).toBe('/Users/x/Exports/读书/sub')
    expect(() => exportDir('/Users/x/Exports/../.ssh')).toThrow()
  })

  it('imports only files the user dropped', () => {
    expect(() => assertUserChosen(['/Users/x/.ssh/id_rsa'])).toThrow()
    rememberUserChosenPath('/Users/x/Downloads/papers')
    expect(() => assertUserChosen(['/Users/x/Downloads/papers/a.pdf'])).not.toThrow()
    expect(() => assertUserChosen(['/Users/x/Downloads/papers/a.pdf', '/etc/hosts'])).toThrow()
  })

  it('reveals programs in Finder instead of running them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-'))
    const pdf = join(dir, 'a.pdf'); writeFileSync(pdf, 'x')
    const script = join(dir, 'run'); writeFileSync(script, '#!/bin/sh'); chmodSync(script, 0o755)
    await openPathSafely(pdf)
    expect(shellMock.openPath).toHaveBeenCalledWith(pdf)
    for (const p of [script, join(dir, 'Evil.app'), join(dir, 'x.command'), join(dir, 'y.PY')]) {
      shellMock.openPath.mockClear()
      await openPathSafely(p)
      expect(shellMock.openPath).not.toHaveBeenCalled()
      expect(shellMock.showItemInFolder).toHaveBeenCalledWith(p)
    }
  })
})
