import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from '../helpers.js'
import { SyncService } from '../../src/sync/service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'
import type { PlatformDeps } from '../../src/platform/index.js'

/**
 * In-memory WebDAV stand-in. Like the real LAN host (X-Banjuan-Mtime header),
 * an upload keeps the client-supplied mtime when given, otherwise "now".
 */
class MockAdapter implements SyncAdapter {
  private files = new Map<string, { content: Buffer; mtime: number }>()

  async connect(_config: SyncConfig): Promise<void> {}
  async disconnect(): Promise<void> {}

  async list(remotePath: string): Promise<RemoteFile[]> {
    const results: RemoteFile[] = []
    for (const [path, data] of this.files) {
      if (!path.startsWith(remotePath)) continue
      results.push({ path, mtime: data.mtime, size: data.content.length, isDirectory: false })
    }
    return results
  }

  async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void> {
    const content = readFileSync(localPath)
    this.files.set(remotePath, { content, mtime: mtimeMs && mtimeMs > 0 ? mtimeMs : Date.now() })
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error(`Not found: ${remotePath}`)
    mkdirSync(dirname(localPath), { recursive: true })
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
  let deps: PlatformDeps
  let adapter: MockAdapter
  let syncService: SyncService

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    deps = testDeps()
    lib = await Library.init(libPath, deps)
    adapter = new MockAdapter()
    // The whole library root is synced; remote paths mirror library-relative paths.
    syncService = new SyncService(libPath, adapter, undefined, deps.fs, '/', deps.crypto)
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

      expect(adapter.has('/.banjuan/tags.json')).toBe(true)
      const remote = JSON.parse(adapter.getContent('/.banjuan/tags.json'))
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
      adapter.seed('/.banjuan/data/annotations/re/remote-ann-001.json', annJson, Date.now() + 10000)

      const result = await syncService.sync()
      expect(result.downloaded).toBeGreaterThan(0)

      const localPath = join(libPath, '.banjuan', 'data', 'annotations', 're', 'remote-ann-001.json')
      expect(existsSync(localPath)).toBe(true)
    })
  })

  describe('delete detection', () => {
    it('does not delete on first sync (no archive)', async () => {
      createTestFile(libPath, 'keep.txt', 'keep')
      await lib.documents.import('keep.txt')

      const result = await syncService.sync()

      expect(result.deletedLocal).toBe(0)
      expect(result.deletedRemote).toBe(0)
      expect(existsSync(join(libPath, 'keep.txt'))).toBe(true)
      const archivePath = join(libPath, '.banjuan', 'sync-archive.json')
      expect(existsSync(archivePath)).toBe(true)
    })

    it('detects local deletion and removes from remote', async () => {
      // A second document stays behind: an entirely empty local listing is
      // treated as unreliable by design and never propagates deletions.
      createTestFile(libPath, 'stay.txt', 'stay')
      await lib.documents.import('stay.txt')
      createTestFile(libPath, 'del.txt', 'delete me')
      const doc = await lib.documents.import('del.txt')
      await syncService.sync()

      const prefix = doc.id.slice(0, 2)
      const remotePath = `/.banjuan/data/documents/${prefix}/${doc.id}.json`
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
      const remotePath = `/.banjuan/data/documents/${prefix}/${doc.id}.json`
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

  describe('annotation edited on both sides', () => {
    it('keeps the local edit as a separate annotation with a new id', async () => {
      createTestFile(libPath, 'paper.txt', 'text')
      const doc = await lib.documents.import('paper.txt')
      const ann = await lib.annotations.create({ docId: doc.id, type: 'highlight', color: '#ff0', content: 'base', position: { type: 'text', start: 0, end: 4, text: 'text' } as any })
      await syncService.sync()

      const rel = `.banjuan/data/annotations/${ann.id.slice(0, 2)}/${ann.id}.json`
      const localAbs = join(libPath, rel)
      writeFileSync(localAbs, JSON.stringify({ ...JSON.parse(readFileSync(localAbs, 'utf-8')), content: 'local edit' }, null, 2))
      adapter.seed('/' + rel, JSON.stringify({ ...JSON.parse(adapter.getContent('/' + rel)), content: 'remote edit' }), Date.now() + 60000)

      const result = await syncService.sync()
      expect(result.conflicts).toBe(1)
      expect(JSON.parse(readFileSync(localAbs, 'utf-8')).content).toBe('remote edit')
      const all = await new (await import('../../src/storage/json-store.js')).JsonStore<any>(join(libPath, '.banjuan', 'data', 'annotations'), deps.fs).listAll()
      const copy = all.find(a => a.conflictOf === ann.id)
      expect(copy).toMatchObject({ content: 'local edit', docId: doc.id })
      expect(copy.id).not.toBe(ann.id)
      expect(all.filter(a => a.id === ann.id)).toHaveLength(1)
    })
  })

  describe('events', () => {
    it('emits sync:started and sync:completed', async () => {
      const { EventBus } = await import('../../src/events/bus.js')
      const events = new EventBus()
      const evSyncService = new SyncService(libPath, adapter, events, deps.fs, '/', deps.crypto)

      let started = false
      let completed = false
      events.on('sync:started', () => { started = true })
      events.on('sync:completed', () => { completed = true })

      await evSyncService.sync()

      expect(started).toBe(true)
      expect(completed).toBe(true)
    })
  })

  // The flat sync-snapshot.json (timestamp + file list) was replaced by the
  // per-file baseline archive sync-archive.json (version 2, files keyed by path).
  describe('archive', () => {
    it('writes sync-archive.json after sync', async () => {
      await syncService.sync()

      const archivePath = join(libPath, '.banjuan', 'sync-archive.json')
      expect(existsSync(archivePath)).toBe(true)

      const archive = JSON.parse(readFileSync(archivePath, 'utf-8'))
      expect(archive.version).toBe(2)
      expect(archive.timestamp).toBeDefined()
      expect(archive.files).toBeTypeOf('object')
      expect(archive.files).not.toBeNull()
      expect(Array.isArray(archive.files)).toBe(false)
    })
  })

  // The plan is made from the scan at the start; a file saved locally while the
  // sync runs must not then be overwritten or binned on that stale view.
  describe('local writes during a sync', () => {
    const editDuring = (rel: string, content: string) => (p: { phase: string; currentFile?: string }) => {
      if (p.phase === 'syncing' && p.currentFile === rel) {
        writeFileSync(join(libPath, rel), content)
        const t = new Date(Date.now() + 5000)
        utimesSync(join(libPath, rel), t, t)
      }
    }

    it('a remote change does not overwrite a local save made meanwhile', async () => {
      createTestFile(libPath, 'doc.txt', 'v1')
      await syncService.sync()
      adapter.seed('/doc.txt', 'remote v2', Date.now() + 60_000)

      const result = await syncService.sync(editDuring('doc.txt', 'local edit') as any)
      expect(readFileSync(join(libPath, 'doc.txt'), 'utf-8')).toBe('local edit')
      expect(result.downloaded).toBe(0)

      // the next sync sees both sides changed: the local edit is kept as a conflict copy
      const next = await syncService.sync()
      expect(next.conflicts).toBe(1)
    })

    it('a remote deletion does not bin a file edited meanwhile', async () => {
      createTestFile(libPath, 'gone.txt', 'v1')
      await syncService.sync()
      await adapter.delete('/gone.txt')

      const result = await syncService.sync(editDuring('gone.txt', 'still wanted') as any)
      expect(result.deletedLocal).toBe(0)
      expect(readFileSync(join(libPath, 'gone.txt'), 'utf-8')).toBe('still wanted')
    })
  })
})
