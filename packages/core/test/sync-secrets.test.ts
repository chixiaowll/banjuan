import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'
import { Library } from '../src/library.js'
import type { SecretBox } from '../src/platform/index.js'

// Stand-in for the OS keychain: reversible, but never the plain text.
const box: SecretBox = {
  seal: s => 'sealed:' + Buffer.from(s).toString('base64'),
  open: s => { if (!s.startsWith('sealed:')) throw new Error('not mine'); return Buffer.from(s.slice(7), 'base64').toString() },
}
const config = { type: 'webdav' as const, url: 'https://dav.example', username: 'me', password: 'hunter2', remotePath: '/banjuan' }

describe('sync.json password', () => {
  let tempDir: string, libPath: string, lib: Library
  const syncFile = () => readFileSync(join(libPath, '.banjuan', 'sync.json'), 'utf-8')

  beforeEach(() => { tempDir = createTempDir(); libPath = join(tempDir, 'lib') })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('is stored sealed and read back in plain', async () => {
    lib = await Library.init(libPath, testDeps({ secrets: box }))
    await lib.saveSyncConfig(config)
    expect(syncFile()).not.toContain('hunter2')
    expect(JSON.parse(syncFile()).passwordSealed).toBeDefined()
    expect(await lib.getSyncConfig()).toEqual(config)
  })

  it('seals a plain password written before, on first read', async () => {
    lib = await Library.init(libPath, testDeps({ secrets: box }))
    writeFileSync(join(libPath, '.banjuan', 'sync.json'), JSON.stringify(config))
    expect(await lib.getSyncConfig()).toEqual(config)
    expect(syncFile()).not.toContain('hunter2')
  })

  it('gives an empty password when it was sealed elsewhere', async () => {
    lib = await Library.init(libPath, testDeps({ secrets: box }))
    const { password, ...rest } = config
    writeFileSync(join(libPath, '.banjuan', 'sync.json'), JSON.stringify({ ...rest, passwordSealed: 'from another mac' }))
    expect(await lib.getSyncConfig()).toEqual({ ...rest, password: '' })
  })

  it('stays plain without a keychain (mobile) or when sealing fails', async () => {
    lib = await Library.init(libPath, testDeps())
    await lib.saveSyncConfig(config)
    expect(JSON.parse(syncFile()).password).toBe('hunter2')
    await lib.close()
    lib = await Library.open(libPath, testDeps({ secrets: { seal: () => { throw new Error('locked') }, open: box.open } }))
    await lib.saveSyncConfig(config)
    expect(JSON.parse(syncFile()).password).toBe('hunter2')
  })
})
