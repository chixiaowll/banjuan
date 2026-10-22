import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from '../helpers.js'
import { SyncService } from '../../src/sync/service.js'
import { IndexService } from '../../src/indexing/service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'
import type { PlatformDeps } from '../../src/platform/index.js'

// In-memory WebDAV stand-in; like the LAN host, an upload keeps the client mtime when given.
class MockAdapter implements SyncAdapter {
  files = new Map<string, { content: Buffer; mtime: number }>()

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
    this.files.set(remotePath, { content: readFileSync(localPath), mtime: mtimeMs && mtimeMs > 0 ? mtimeMs : Date.now() })
  }
  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error('Not found')
    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, data.content)
  }
  async delete(remotePath: string): Promise<void> { this.files.delete(remotePath) }
  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const d = this.files.get(remotePath)!
    return { mtime: d.mtime, size: d.content.length }
  }
  async mkdir(_remotePath: string): Promise<void> {}

  seed(remotePath: string, content: string, mtime?: number): void {
    this.files.set(remotePath, { content: Buffer.from(content), mtime: mtime ?? Date.now() })
  }
}

describe('Sync + Index Integration', () => {
  let tempDir: string
  let lib: Library
  let libPath: string
  let deps: PlatformDeps
  let adapter: MockAdapter

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    deps = testDeps()
    lib = await Library.init(libPath, deps)
    adapter = new MockAdapter()
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('sync pulls remote annotation then rebuild indexes it', async () => {
    const annJson = JSON.stringify({
      id: 'remote-ann-int', docId: 'doc-001', type: 'highlight', page: 1,
      position: { type: 'pdf', page: 1, rects: [], text: '' },
      content: 'synced annotation', selectedText: 'selected', color: 'yellow',
      createdAt: '2026-04-25T10:00:00Z', updatedAt: '2026-04-25T10:00:00Z',
    })
    // Remote paths mirror library-relative paths (the whole library root is synced).
    adapter.seed('/.banjuan/data/annotations/re/remote-ann-int.json', annJson, Date.now() + 10000)

    const syncService = new SyncService(libPath, adapter, undefined, deps.fs, '/', deps.crypto)
    await syncService.sync()

    const localPath = join(libPath, '.banjuan', 'data', 'annotations', 're', 'remote-ann-int.json')
    expect(existsSync(localPath)).toBe(true)

    const db = (lib as any).db
    const indexer = new IndexService(db, libPath, deps.fs)
    await indexer.rebuildFull()

    const ann = await lib.annotations.get('remote-ann-int')
    expect(ann).not.toBeNull()
    expect(ann!.content).toBe('synced annotation')
  })

  it('round-trip: create locally, sync, wipe SQLite, rebuild', async () => {
    createTestFile(libPath, 'round.pdf', Buffer.from('pdf'))
    const doc = await lib.documents.import('round.pdf')
    const note = await lib.notes.create({ title: 'Round Trip', content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]) })

    const syncService = new SyncService(libPath, adapter, undefined, deps.fs, '/', deps.crypto)
    await syncService.sync()

    const db = (lib as any).db
    db.run('DELETE FROM documents')
    db.run('DELETE FROM notes')

    const indexer = new IndexService(db, libPath, deps.fs)
    await indexer.rebuildFull()

    expect(await lib.documents.get(doc.id)).not.toBeNull()
    expect(await lib.notes.get(note.id)).not.toBeNull()
  })
})
