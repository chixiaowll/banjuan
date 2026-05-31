import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { Library } from './library.js'

function deps() {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), globalPluginsDir: join(tmpdir(), 'gp') }
}

describe('Library identity', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'lib-id-')) + '/lib' })

  it('init writes a 32-char hex id into config.json', async () => {
    const lib = await Library.init(root, deps() as any, 'Test')
    const id = await lib.getId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    const cfg = JSON.parse(readFileSync(join(root, '.banjuan', 'config.json'), 'utf-8'))
    expect(cfg.id).toBe(id)
  })

  it('open back-fills id for a legacy library that lacks one', async () => {
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    writeFileSync(join(root, '.banjuan', 'config.json'),
      JSON.stringify({ name: 'Legacy', version: '1', createdAt: '2026-01-01T00:00:00.000Z' }))
    const lib = await Library.open(root, deps() as any)
    const id = await lib.getId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    const cfg = JSON.parse(readFileSync(join(root, '.banjuan', 'config.json'), 'utf-8'))
    expect(cfg.id).toBe(id)
    const lib2 = await Library.open(root, deps() as any)
    expect(await lib2.getId()).toBe(id)
  })

  it('adoptLibraryId overwrites the id', async () => {
    const lib = await Library.init(root, deps() as any, 'Test')
    await lib.adoptLibraryId('ffffffffffffffffffffffffffffffff')
    expect(await lib.getId()).toBe('ffffffffffffffffffffffffffffffff')
  })
})
