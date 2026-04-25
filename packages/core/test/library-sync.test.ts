import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { SyncService } from '../src/sync/service.js'
import { StubService } from '../src/sync/stub-service.js'
import { createTempDir, cleanupTempDir } from './helpers.js'
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

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('getSyncConfig', () => {
    it('returns null when sync.json does not exist', () => {
      const config = lib.getSyncConfig()
      expect(config).toBeNull()
    })
  })

  describe('saveSyncConfig / getSyncConfig', () => {
    it('writes sync.json and reads it back correctly', () => {
      lib.saveSyncConfig(testConfig)
      const config = lib.getSyncConfig()
      expect(config).toEqual(testConfig)
    })
  })

  describe('createSyncService', () => {
    it('returns a SyncService when config exists', () => {
      lib.saveSyncConfig(testConfig)
      const service = lib.createSyncService()
      expect(service).toBeInstanceOf(SyncService)
    })

    it('throws when no config exists', () => {
      expect(() => lib.createSyncService()).toThrow('No sync configuration found')
    })
  })

  describe('createStubService', () => {
    it('returns a StubService when config exists', () => {
      lib.saveSyncConfig(testConfig)
      const service = lib.createStubService()
      expect(service).toBeInstanceOf(StubService)
    })
  })
})
