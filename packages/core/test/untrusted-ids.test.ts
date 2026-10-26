import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { JsonStore } from '../src/storage/json-store.js'
import { hasPlainPath, isSafeId, isPlainRelPath } from '../src/storage/safe-path.js'
import { Library } from '../src/library.js'
import { createTempDir, testDeps } from './helpers.js'

// Note / document / annotation JSON can arrive from a sync peer. An id or path
// inside it must never let the library read, move or delete files elsewhere.

describe('safe ids and paths', () => {
  it('accepts uuids and plain relative paths only', () => {
    expect(isSafeId('5f0c2a7e-1b2c-4d3e-8f90-123456789abc')).toBe(true)
    for (const id of ['', '..', '../..', 'a/b', 'a\\b', '.hidden', 'a..b', 'x'.repeat(201), 42, null]) expect(isSafeId(id)).toBe(false)
    expect(isPlainRelPath('Books/a.pdf')).toBe(true)
    for (const p of ['', '/etc/passwd', '../a', 'a/../../b', 'a\\..\\b', 'C:/x', './a']) expect(isPlainRelPath(p)).toBe(false)
  })
})

describe('JsonStore with untrusted files', () => {
  it('skips records whose id or path would leave their folder', async () => {
    const dir = createTempDir()
    const store = new JsonStore<{ id: string; path: string }>(dir, new NodeFS(), hasPlainPath)
    await store.write({ id: 'aa111', path: 'Books/a.pdf' })
    mkdirSync(join(dir, 'bb'), { recursive: true })
    writeFileSync(join(dir, 'bb', 'bb1.json'), JSON.stringify({ id: '../../evil', path: 'x.pdf' }))
    writeFileSync(join(dir, 'bb', 'bb2.json'), JSON.stringify({ id: 'bb2', path: '../../../etc/passwd' }))
    expect((await store.listAll()).map(d => d.id)).toEqual(['aa111'])
    expect(await store.read('../aa111')).toBeNull()
    expect(await store.delete('../../x')).toBe(false)
    await expect(store.write({ id: '../x', path: 'a' })).rejects.toThrow('Invalid id')
  })
})

describe('JsonStore and sync conflict copies', () => {
  it('reads only <id>.json, not a conflict copy carrying the same id', async () => {
    const dir = createTempDir()
    const store = new JsonStore<{ id: string; v: number }>(dir, new NodeFS())
    await store.write({ id: 'aa111', v: 2 })
    writeFileSync(join(dir, 'aa', 'aa111.sync-conflict-1700-iPad.json'), JSON.stringify({ id: 'aa111', v: 1 }))
    expect(await store.listAll()).toEqual([{ id: 'aa111', v: 2 }])
  })
})

describe('a synced note file with a malicious id', () => {
  it('is not indexed, and attachment cleanup cannot reach outside the attachments folder', async () => {
    const parent = createTempDir()
    const root = join(parent, 'lib')
    const lib = await Library.init(root, testDeps())
    const victim = join(parent, 'victim.txt')
    writeFileSync(victim, 'keep me')
    mkdirSync(join(root, '.banjuan', 'notes'), { recursive: true })
    writeFileSync(join(root, '.banjuan', 'notes', 'evil.json'), JSON.stringify({
      meta: { id: '../../..', title: 'evil', type: 'markdown', createdAt: '2026-01-01', updatedAt: '2026-01-01' }, content: '[]',
    }))
    await lib.notes.syncDisk()
    expect((await lib.notes.list()).map(n => n.title)).not.toContain('evil')

    await lib.attachments.deleteAllForNote('../../..')
    await expect(lib.attachments.delete('attachments/../../../victim.txt')).rejects.toThrow()
    expect(() => lib.attachments.getFullPath('../../victim.txt')).toThrow()
    await expect(lib.attachments.save('../..', 'a.png', new Uint8Array([1]))).rejects.toThrow()
    expect(existsSync(victim)).toBe(true)
    expect(existsSync(root)).toBe(true)
    await lib.close()
  })
})
