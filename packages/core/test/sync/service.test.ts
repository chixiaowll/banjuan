import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from '../helpers.js'
import { SyncService } from '../../src/sync/service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'

class MockAdapter implements SyncAdapter {
  private files = new Map<string, { content: Buffer; mtime: number }>()

  async connect(_config: SyncConfig): Promise<void> {}
  async disconnect(): Promise<void> {}

  async list(_remotePath: string): Promise<RemoteFile[]> {
    const results: RemoteFile[] = []
    for (const [path, data] of this.files) {
      results.push({ path, mtime: data.mtime, size: data.content.length, isDirectory: false })
    }
    return results
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const content = readFileSync(localPath)
    this.files.set(remotePath, { content, mtime: Date.now() })
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error(`Not found: ${remotePath}`)
    mkdirSync(join(localPath, '..'), { recursive: true })
    writeFileSync(localPath, data.content)
  }

  async delete(remotePath: string): Promise<void> {
    this.files.delete(remotePath)
  }

  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error(`Not found: ${remotePath}`)
    return { mtime: data.mtime, size: data.content.length }
  }

  async mkdir(_remotePath: string): Promise<void> {}

  seed(remotePath: string, content: string, mtime?: number): void {
    this.files.set(remotePath, { content: Buffer.from(content), mtime: mtime ?? Date.now() })
  }

  has(remotePath: string): boolean {
    return this.files.has(remotePath)
  }

  getContent(remotePath: string): string {
    return this.files.get(remotePath)!.content.toString()
  }
}

describe('SyncService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string
  let adapter: MockAdapter
  let syncService: SyncService

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    adapter = new MockAdapter()
    syncService = new SyncService(libPath, adapter)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('push', () => {
    it('uploads local files to remote', async () => {
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      await lib.documents.import('test.pdf')

      const result = await syncService.sync()
      expect(result.uploaded).toBeGreaterThan(0)
    })

    it('uploads tags.json', async () => {
      await lib.tags.create({ name: 'SyncTag' })

      await syncService.sync()

      expect(adapter.has('/tags.json')).toBe(true)
      const remote = JSON.parse(adapter.getContent('/tags.json'))
      expect(remote[0].name).toBe('SyncTag')
    })
  })

  describe('pull', () => {
    it('downloads remote files to local', async () => {
      const annJson = JSON.stringify({
        id: 'remote-ann-001', docId: 'doc-001', type: 'highlight', page: 1,
        position: {}, content: 'from remote', selectedText: null, color: 'yellow',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
      adapter.seed('/data/annotations/re/remote-ann-001.json', annJson, Date.now() + 10000)

      const result = await syncService.sync()
      expect(result.downloaded).toBeGreaterThan(0)

      const localPath = join(libPath, '.banjuan', 'data', 'annotations', 're', 'remote-ann-001.json')
      expect(existsSync(localPath)).toBe(true)
    })
  })

  describe('delete detection', () => {
    it('does not delete on first sync (no snapshot)', async () => {
      createTestFile(libPath, 'keep.txt', 'keep')
      await lib.documents.import('keep.txt')

      await syncService.sync()

      const snapshotPath = join(libPath, '.banjuan', 'sync-snapshot.json')
      expect(existsSync(snapshotPath)).toBe(true)
    })

    it('detects local deletion and removes from remote', async () => {
      createTestFile(libPath, 'del.txt', 'delete me')
      const doc = await lib.documents.import('del.txt')
      await syncService.sync()

      const prefix = doc.id.slice(0, 2)
      const remotePath = `/data/documents/${prefix}/${doc.id}.json`
      expect(adapter.has(remotePath)).toBe(true)

      await lib.documents.delete(doc.id)

      const result = await syncService.sync()
      expect(result.deletedRemote).toBeGreaterThan(0)
      expect(adapter.has(remotePath)).toBe(false)
    })
  })

  describe('conflict resolution', () => {
    it('remote wins when remote mtime is newer', async () => {
      createTestFile(libPath, 'conflict.txt', 'original')
      const doc = await lib.documents.import('conflict.txt')
      await syncService.sync()

      const prefix = doc.id.slice(0, 2)
      const remotePath = `/data/documents/${prefix}/${doc.id}.json`
      const updatedJson = JSON.stringify({
        ...JSON.parse(adapter.getContent(remotePath)),
        title: 'Remote Updated',
      })
      adapter.seed(remotePath, updatedJson, Date.now() + 60000)

      await syncService.sync()

      const localPath = join(libPath, '.banjuan', 'data', 'documents', prefix, `${doc.id}.json`)
      const localData = JSON.parse(readFileSync(localPath, 'utf-8'))
      expect(localData.title).toBe('Remote Updated')
    })
  })

  describe('snapshot', () => {
    it('writes sync-snapshot.json after sync', async () => {
      await syncService.sync()

      const snapshotPath = join(libPath, '.banjuan', 'sync-snapshot.json')
      expect(existsSync(snapshotPath)).toBe(true)

      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
      expect(snapshot.timestamp).toBeDefined()
      expect(Array.isArray(snapshot.files)).toBe(true)
    })
  })
})
