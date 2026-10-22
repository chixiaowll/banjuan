import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { SyncService } from '../src/sync/service.js'
import { StubService } from '../src/sync/stub-service.js'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'
import type { SyncConfig } from '../src/types.js'

const testConfig: SyncConfig = {
  type: 'webdav',
  url: 'https://dav.example.com',
  username: 'user',
  password: 'pass',
  remotePath: '/banjuan',
}

describe('Library sync helpers', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('getSyncConfig', () => {
    it('returns null when sync.json does not exist', async () => {
      const config = await lib.getSyncConfig()
      expect(config).toBeNull()
    })
  })

  describe('saveSyncConfig / getSyncConfig', () => {
    it('writes sync.json and reads it back correctly', async () => {
      await lib.saveSyncConfig(testConfig)
      const config = await lib.getSyncConfig()
      expect(config).toEqual(testConfig)
    })
  })

  describe('createSyncService', () => {
    it('returns a SyncService when config exists', async () => {
      await lib.saveSyncConfig(testConfig)
      const service = lib.createSyncService()
      expect(service).toBeInstanceOf(SyncService)
      // Config-driven path in the current design: stored config → connected service.
      const config = (await lib.getSyncConfig())!
      expect(await lib.createSyncServiceConnected(config)).toBeInstanceOf(SyncService)
    })

    // createSyncService() no longer reads sync.json (and so no longer throws
    // 'No sync configuration found'): the config is now handed explicitly to
    // createSyncServiceConnected(). Without it the remote is unreachable, so a
    // sync must fail every remote operation instead of silently "succeeding".
    it('cannot reach the remote without a connected config', async () => {
      const service = lib.createSyncService()
      const result = await service.sync()
      expect(result.uploaded).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      for (const err of result.errors) expect(err).toContain('Not connected')
    })
  })

  describe('createStubService', () => {
    it('returns a StubService when config exists', async () => {
      await lib.saveSyncConfig(testConfig)
      const service = lib.createStubService()
      expect(service).toBeInstanceOf(StubService)
    })
  })
})
