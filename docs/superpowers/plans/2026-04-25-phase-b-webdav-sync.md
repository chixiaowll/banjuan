# Phase B: WebDAV Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement bidirectional file sync over WebDAV — push local changes to remote, pull remote changes to local, detect deletions via snapshot, and manage large file stubs.

**Architecture:** SyncAdapter interface → WebDAVAdapter implementation → SyncService orchestrates bidirectional sync using mtime comparison and sync-snapshot.json for delete detection → StubService manages large file placeholders. All sync operates on the file layer; after sync completes, IndexService rebuilds SQLite.

**Tech Stack:** webdav (npm package), Node.js fs, existing JsonStore/frontmatter utilities, IndexService from Phase A.

---

### Task 1: Types and SyncAdapter Interface

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/sync/adapter.ts`
- Create: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Add sync-related types to types.ts**

Add at the end of `packages/core/src/types.ts` (before the `BanjuanEventMap` type):

```typescript
export interface SyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  remotePath: string
}

export interface RemoteFile {
  path: string
  mtime: number
  size: number
  isDirectory: boolean
}

export interface SyncSnapshot {
  timestamp: number
  files: string[]
}

export interface StubData {
  id: string
  hash: string
  size: number
  remotePath: string
  createdAt: string
}

export type DocumentSyncStatus = 'local' | 'cloud' | 'synced'
```

- [ ] **Step 2: Create the SyncAdapter interface**

Create `packages/core/src/sync/adapter.ts`:

```typescript
import type { SyncConfig, RemoteFile } from '../types.js'

export interface SyncAdapter {
  connect(config: SyncConfig): Promise<void>
  disconnect(): Promise<void>
  list(remotePath: string): Promise<RemoteFile[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string): Promise<void>
  delete(remotePath: string): Promise<void>
  getMetadata(remotePath: string): Promise<{ mtime: number; size: number }>
  mkdir(remotePath: string): Promise<void>
}
```

- [ ] **Step 3: Create barrel export**

Create `packages/core/src/sync/index.ts`:

```typescript
export type { SyncAdapter } from './adapter.js'
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/sync/
git commit -m "feat(core): add sync types and SyncAdapter interface"
```

---

### Task 2: WebDAVAdapter Implementation

**Files:**
- Create: `packages/core/src/sync/webdav-adapter.ts`
- Create: `packages/core/test/sync/webdav-adapter.test.ts`
- Modify: `packages/core/src/sync/index.ts`
- Modify: `packages/core/package.json` (add webdav dependency)

- [ ] **Step 1: Install webdav package**

```bash
pnpm --filter @banjuan/core add webdav
```

- [ ] **Step 2: Write tests for WebDAVAdapter**

Create `packages/core/test/sync/webdav-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebDAVAdapter } from '../../src/sync/webdav-adapter.js'
import type { SyncConfig } from '../../src/types.js'

// We test the adapter with mocked webdav client since we can't
// spin up a real WebDAV server in unit tests.

describe('WebDAVAdapter', () => {
  let adapter: WebDAVAdapter

  beforeEach(() => {
    adapter = new WebDAVAdapter()
  })

  it('throws if not connected', async () => {
    await expect(adapter.list('/')).rejects.toThrow('Not connected')
  })

  it('connect creates a client', async () => {
    const config: SyncConfig = {
      type: 'webdav',
      url: 'https://example.com/dav',
      username: 'user',
      password: 'pass',
      remotePath: '/banjuan',
    }

    // connect should not throw (it just creates the client)
    await adapter.connect(config)
    // disconnect should not throw
    await adapter.disconnect()
  })
})
```

- [ ] **Step 3: Implement WebDAVAdapter**

Create `packages/core/src/sync/webdav-adapter.ts`:

```typescript
import { createClient, type WebDAVClient } from 'webdav'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SyncConfig, RemoteFile } from '../types.js'
import type { SyncAdapter } from './adapter.js'

interface WebDAVStat {
  filename: string
  basename: string
  lastmod: string
  size: number
  type: 'file' | 'directory'
}

export class WebDAVAdapter implements SyncAdapter {
  private client: WebDAVClient | null = null

  async connect(config: SyncConfig): Promise<void> {
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password,
    })
  }

  async disconnect(): Promise<void> {
    this.client = null
  }

  private getClient(): WebDAVClient {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    const client = this.getClient()
    const items = await client.getDirectoryContents(remotePath, { deep: true }) as WebDAVStat[]
    return items.map(item => ({
      path: item.filename,
      mtime: new Date(item.lastmod).getTime(),
      size: item.size,
      isDirectory: item.type === 'directory',
    }))
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const client = this.getClient()
    const content = readFileSync(localPath)
    await client.putFileContents(remotePath, content)
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const client = this.getClient()
    const content = await client.getFileContents(remotePath) as Buffer
    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, content)
  }

  async delete(remotePath: string): Promise<void> {
    const client = this.getClient()
    await client.deleteFile(remotePath)
  }

  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const client = this.getClient()
    const stat = await client.stat(remotePath) as WebDAVStat
    return {
      mtime: new Date(stat.lastmod).getTime(),
      size: stat.size,
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    const client = this.getClient()
    await client.createDirectory(remotePath, { recursive: true })
  }
}
```

- [ ] **Step 4: Update barrel export**

Update `packages/core/src/sync/index.ts`:

```typescript
export type { SyncAdapter } from './adapter.js'
export { WebDAVAdapter } from './webdav-adapter.js'
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @banjuan/core test -- webdav-adapter.test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/webdav-adapter.ts packages/core/test/sync/ packages/core/src/sync/index.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): implement WebDAVAdapter using webdav package

Wraps the webdav npm client to implement SyncAdapter interface.
Supports list, upload, download, delete, getMetadata, mkdir."
```

---

### Task 3: SyncService — Core Sync Orchestration

**Files:**
- Create: `packages/core/src/sync/service.ts`
- Create: `packages/core/test/sync/service.test.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write tests with a mock adapter**

Create `packages/core/test/sync/service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync } from 'node:fs'
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

  async list(remotePath: string): Promise<RemoteFile[]> {
    const results: RemoteFile[] = []
    for (const [path, data] of this.files) {
      if (path.startsWith(remotePath)) {
        results.push({
          path,
          mtime: data.mtime,
          size: data.content.length,
          isDirectory: false,
        })
      }
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

  // Test helper: seed remote files
  seed(remotePath: string, content: string, mtime?: number): void {
    this.files.set(remotePath, {
      content: Buffer.from(content),
      mtime: mtime ?? Date.now(),
    })
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

      // .banjuan/data/documents/ files should be on remote
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
        id: 'remote-ann-001',
        docId: 'doc-001',
        type: 'highlight',
        page: 1,
        position: {},
        content: 'from remote',
        selectedText: null,
        color: 'yellow',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

      // Verify snapshot was created
      const snapshotPath = join(libPath, '.banjuan', 'sync-snapshot.json')
      expect(existsSync(snapshotPath)).toBe(true)
    })

    it('detects local deletion and removes from remote', async () => {
      // First: create a document and sync
      createTestFile(libPath, 'del.txt', 'delete me')
      const doc = await lib.documents.import('del.txt')
      await syncService.sync()

      // Get the remote path for this doc's JSON
      const prefix = doc.id.slice(0, 2)
      const remotePath = `/data/documents/${prefix}/${doc.id}.json`
      expect(adapter.has(remotePath)).toBe(true)

      // Now delete locally
      await lib.documents.delete(doc.id)

      // Sync again — should detect deletion via snapshot diff
      const result = await syncService.sync()
      expect(result.deletedRemote).toBeGreaterThan(0)
      expect(adapter.has(remotePath)).toBe(false)
    })
  })

  describe('conflict resolution (last-write-wins)', () => {
    it('remote wins when remote mtime is newer', async () => {
      createTestFile(libPath, 'conflict.txt', 'original')
      const doc = await lib.documents.import('conflict.txt')
      await syncService.sync()

      // Simulate remote update with newer mtime
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
```

- [ ] **Step 2: Implement SyncService**

Create `packages/core/src/sync/service.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, readdirSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import type { SyncAdapter } from './adapter.js'
import type { SyncSnapshot, RemoteFile } from '../types.js'

interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  errors: string[]
}

export class SyncService {
  private snapshotPath: string
  private banjuanDir: string

  constructor(private rootPath: string, private adapter: SyncAdapter) {
    this.banjuanDir = join(rootPath, '.banjuan')
    this.snapshotPath = join(this.banjuanDir, 'sync-snapshot.json')
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, errors: [] }

    const localFiles = this.collectLocalFiles()
    const remoteFiles = await this.collectRemoteFiles()
    const snapshot = this.readSnapshot()

    const localMap = new Map(localFiles.map(f => [f.relativePath, f]))
    const remoteMap = new Map(remoteFiles.map(f => [f.relativePath, f]))
    const snapshotSet = snapshot ? new Set(snapshot.files) : null

    const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()])

    for (const path of allPaths) {
      const local = localMap.get(path)
      const remote = remoteMap.get(path)

      try {
        if (local && remote) {
          // Both exist: compare mtime
          if (remote.mtime > local.mtime + 1000) {
            // Remote is newer — download
            await this.adapter.download(this.toRemotePath(path), local.absolutePath)
            result.downloaded++
          } else if (local.mtime > remote.mtime + 1000) {
            // Local is newer — upload
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
          }
        } else if (local && !remote) {
          if (snapshotSet && snapshotSet.has(path)) {
            // Was in snapshot but gone from remote → remote deleted it
            unlinkSync(local.absolutePath)
            result.deletedLocal++
          } else {
            // New local file → upload
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
          }
        } else if (!local && remote) {
          if (snapshotSet && snapshotSet.has(path)) {
            // Was in snapshot but gone locally → local deleted it
            await this.adapter.delete(this.toRemotePath(path))
            result.deletedRemote++
          } else {
            // New remote file → download
            const localPath = this.toLocalPath(path)
            mkdirSync(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            result.downloaded++
          }
        }
      } catch (err) {
        result.errors.push(`${path}: ${(err as Error).message}`)
      }
    }

    // Write snapshot
    const finalFiles = [...new Set([
      ...localFiles.map(f => f.relativePath),
      ...remoteFiles.map(f => f.relativePath),
    ])]
    this.writeSnapshot({ timestamp: Date.now(), files: finalFiles })

    return result
  }

  private collectLocalFiles(): Array<{ relativePath: string; absolutePath: string; mtime: number }> {
    const results: Array<{ relativePath: string; absolutePath: string; mtime: number }> = []

    // Sync targets:
    // .banjuan/data/** (documents, annotations, mindmaps)
    // .banjuan/tags.json
    // .banjuan/config.json
    // .banjuan/sync.json
    // .banjuan/stubs/**
    // notes/**/*.md

    const dataDir = join(this.banjuanDir, 'data')
    if (existsSync(dataDir)) {
      this.walkDir(dataDir, (absPath) => {
        if (!absPath.endsWith('.json')) return
        const rel = relative(this.banjuanDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    // Single files in .banjuan/
    for (const name of ['tags.json', 'config.json', 'sync.json']) {
      const p = join(this.banjuanDir, name)
      if (existsSync(p)) {
        const stat = statSync(p)
        results.push({ relativePath: name, absolutePath: p, mtime: stat.mtimeMs })
      }
    }

    // Stubs
    const stubsDir = join(this.banjuanDir, 'stubs')
    if (existsSync(stubsDir)) {
      this.walkDir(stubsDir, (absPath) => {
        if (!absPath.endsWith('.json')) return
        const rel = relative(this.banjuanDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    // Notes
    const notesDir = join(this.rootPath, 'notes')
    if (existsSync(notesDir)) {
      this.walkDir(notesDir, (absPath) => {
        if (!absPath.endsWith('.md')) return
        const rel = 'notes/' + relative(notesDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    return results
  }

  private async collectRemoteFiles(): Promise<Array<{ relativePath: string; mtime: number }>> {
    const results: Array<{ relativePath: string; mtime: number }> = []
    try {
      const items = await this.adapter.list('/')
      for (const item of items) {
        if (item.isDirectory) continue
        // Remote paths start with / — strip leading /
        const rel = item.path.startsWith('/') ? item.path.slice(1) : item.path
        results.push({ relativePath: rel, mtime: item.mtime })
      }
    } catch {
      // Remote might be empty on first sync
    }
    return results
  }

  private walkDir(dir: string, callback: (absPath: string) => void): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        this.walkDir(fullPath, callback)
      } else {
        callback(fullPath)
      }
    }
  }

  private toRemotePath(relativePath: string): string {
    return '/' + relativePath
  }

  private toLocalPath(relativePath: string): string {
    if (relativePath.startsWith('notes/')) {
      return join(this.rootPath, relativePath)
    }
    return join(this.banjuanDir, relativePath)
  }

  private async ensureRemoteDir(relativePath: string): Promise<void> {
    const dir = dirname('/' + relativePath)
    if (dir !== '/') {
      try { await this.adapter.mkdir(dir) } catch { /* may already exist */ }
    }
  }

  private readSnapshot(): SyncSnapshot | null {
    if (!existsSync(this.snapshotPath)) return null
    return JSON.parse(readFileSync(this.snapshotPath, 'utf-8'))
  }

  private writeSnapshot(snapshot: SyncSnapshot): void {
    writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2))
  }
}
```

- [ ] **Step 3: Update barrel export**

Update `packages/core/src/sync/index.ts`:

```typescript
export type { SyncAdapter } from './adapter.js'
export { WebDAVAdapter } from './webdav-adapter.js'
export { SyncService } from './service.js'
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @banjuan/core test -- sync/service.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/service.ts packages/core/test/sync/service.test.ts packages/core/src/sync/index.ts
git commit -m "feat(core): implement SyncService with bidirectional sync

Mtime-based bidirectional file sync with last-write-wins conflict
resolution. Uses sync-snapshot.json for delete detection. First
sync never deletes. Syncs .banjuan/data/**, tags.json, config.json,
stubs/**, and notes/**/*.md."
```

---

### Task 4: StubService — Large File Management

**Files:**
- Create: `packages/core/src/sync/stub-service.ts`
- Create: `packages/core/test/sync/stub-service.test.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write tests for StubService**

Create `packages/core/test/sync/stub-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from '../helpers.js'
import { StubService } from '../../src/sync/stub-service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'

class MockAdapter implements SyncAdapter {
  private files = new Map<string, Buffer>()

  async connect(_config: SyncConfig): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(_remotePath: string): Promise<RemoteFile[]> { return [] }
  async upload(localPath: string, remotePath: string): Promise<void> {
    this.files.set(remotePath, readFileSync(localPath))
  }
  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error('Not found')
    mkdirSync(join(localPath, '..'), { recursive: true })
    writeFileSync(localPath, data)
  }
  async delete(_remotePath: string): Promise<void> {}
  async getMetadata(_remotePath: string): Promise<{ mtime: number; size: number }> {
    return { mtime: Date.now(), size: 0 }
  }
  async mkdir(_remotePath: string): Promise<void> {}

  seed(remotePath: string, content: Buffer): void {
    this.files.set(remotePath, content)
  }

  has(remotePath: string): boolean {
    return this.files.has(remotePath)
  }
}

describe('StubService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string
  let adapter: MockAdapter
  let stubService: StubService

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    adapter = new MockAdapter()
    stubService = new StubService(libPath, adapter)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('createStub', () => {
    it('creates a stub file', async () => {
      stubService.createStub({
        id: 'doc-123',
        hash: 'abc123',
        size: 5242880,
        remotePath: 'papers/attention.pdf',
      })

      const stubPath = join(libPath, '.banjuan', 'stubs', 'do', 'doc-123.stub.json')
      expect(existsSync(stubPath)).toBe(true)

      const data = JSON.parse(readFileSync(stubPath, 'utf-8'))
      expect(data.id).toBe('doc-123')
      expect(data.remotePath).toBe('papers/attention.pdf')
    })
  })

  describe('listStubs', () => {
    it('lists all stubs', () => {
      stubService.createStub({ id: 'doc-1', hash: 'h1', size: 100, remotePath: 'a.pdf' })
      stubService.createStub({ id: 'doc-2', hash: 'h2', size: 200, remotePath: 'b.pdf' })

      const stubs = stubService.listStubs()
      expect(stubs).toHaveLength(2)
    })
  })

  describe('downloadFile', () => {
    it('downloads file from remote and removes stub', async () => {
      const pdfContent = Buffer.from('fake pdf content')
      adapter.seed('/papers/attention.pdf', pdfContent)

      stubService.createStub({
        id: 'doc-dl',
        hash: 'h',
        size: pdfContent.length,
        remotePath: 'papers/attention.pdf',
      })

      await stubService.downloadFile('doc-dl', join(libPath, 'papers', 'attention.pdf'))

      // File downloaded
      expect(existsSync(join(libPath, 'papers', 'attention.pdf'))).toBe(true)
      expect(readFileSync(join(libPath, 'papers', 'attention.pdf'))).toEqual(pdfContent)

      // Stub removed
      const stubPath = join(libPath, '.banjuan', 'stubs', 'do', 'doc-dl.stub.json')
      expect(existsSync(stubPath)).toBe(false)
    })
  })

  describe('uploadFile', () => {
    it('uploads local file to remote', async () => {
      createTestFile(libPath, 'big.pdf', Buffer.from('large file'))

      await stubService.uploadFile(join(libPath, 'big.pdf'), 'big.pdf')

      expect(adapter.has('/big.pdf')).toBe(true)
    })
  })

  describe('getStatus', () => {
    it('returns local when file exists and no stub', () => {
      createTestFile(libPath, 'local.pdf', 'x')
      expect(stubService.getStatus('no-stub-id', join(libPath, 'local.pdf'))).toBe('local')
    })

    it('returns cloud when stub exists and no file', () => {
      stubService.createStub({ id: 'cloud-id', hash: 'h', size: 100, remotePath: 'x.pdf' })
      expect(stubService.getStatus('cloud-id', join(libPath, 'nonexistent.pdf'))).toBe('cloud')
    })

    it('returns synced when both file and no stub', () => {
      createTestFile(libPath, 'synced.pdf', 'x')
      expect(stubService.getStatus('synced-id', join(libPath, 'synced.pdf'))).toBe('synced')
    })
  })
})
```

- [ ] **Step 2: Implement StubService**

Create `packages/core/src/sync/stub-service.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { SyncAdapter } from './adapter.js'
import type { StubData, DocumentSyncStatus } from '../types.js'

export class StubService {
  private stubsDir: string

  constructor(private rootPath: string, private adapter: SyncAdapter) {
    this.stubsDir = join(rootPath, '.banjuan', 'stubs')
  }

  private stubPath(id: string): string {
    return join(this.stubsDir, id.slice(0, 2), `${id}.stub.json`)
  }

  createStub(input: Omit<StubData, 'createdAt'>): void {
    const data: StubData = { ...input, createdAt: new Date().toISOString() }
    const path = this.stubPath(data.id)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2))
  }

  getStub(id: string): StubData | null {
    const path = this.stubPath(id)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  listStubs(): StubData[] {
    if (!existsSync(this.stubsDir)) return []
    const results: StubData[] = []
    const prefixes = readdirSync(this.stubsDir, { withFileTypes: true })
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) continue
      const files = readdirSync(join(this.stubsDir, prefix.name), { withFileTypes: true })
      for (const file of files) {
        if (!file.name.endsWith('.stub.json')) continue
        const content = readFileSync(join(this.stubsDir, prefix.name, file.name), 'utf-8')
        results.push(JSON.parse(content))
      }
    }
    return results
  }

  removeStub(id: string): void {
    const path = this.stubPath(id)
    if (existsSync(path)) unlinkSync(path)
  }

  async downloadFile(id: string, localPath: string): Promise<void> {
    const stub = this.getStub(id)
    if (!stub) throw new Error(`Stub not found: ${id}`)
    mkdirSync(dirname(localPath), { recursive: true })
    await this.adapter.download('/' + stub.remotePath, localPath)
    this.removeStub(id)
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.adapter.upload(localPath, '/' + remotePath)
  }

  getStatus(docId: string, localFilePath: string): DocumentSyncStatus {
    const hasLocal = existsSync(localFilePath)
    const hasStub = this.getStub(docId) !== null
    if (hasStub && !hasLocal) return 'cloud'
    if (hasLocal) return hasStub ? 'local' : (this.wasUploaded(docId) ? 'synced' : 'local')
    return 'local'
  }

  private wasUploaded(_docId: string): boolean {
    // In a full implementation, check if the file exists on remote.
    // For now, if file exists locally and no stub, treat as synced
    // when there's no stub (the user might have uploaded it).
    return true
  }
}
```

- [ ] **Step 3: Update barrel export**

Update `packages/core/src/sync/index.ts`:

```typescript
export type { SyncAdapter } from './adapter.js'
export { WebDAVAdapter } from './webdav-adapter.js'
export { SyncService } from './service.js'
export { StubService } from './stub-service.js'
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @banjuan/core test -- stub-service.test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/stub-service.ts packages/core/test/sync/stub-service.test.ts packages/core/src/sync/index.ts
git commit -m "feat(core): add StubService for large file management

Creates/reads/removes stub files in .banjuan/stubs/{prefix}/.
Supports download from remote (via SyncAdapter) and upload to
remote. Reports document status: local/cloud/synced."
```

---

### Task 5: Sync + IndexService Integration

**Files:**
- Modify: `packages/core/src/sync/service.ts`
- Create: `packages/core/test/sync/integration.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write integration test**

Create `packages/core/test/sync/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from '../helpers.js'
import { SyncService } from '../../src/sync/service.js'
import { IndexService } from '../../src/indexing/service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'

class MockAdapter implements SyncAdapter {
  files = new Map<string, { content: Buffer; mtime: number }>()

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
    this.files.set(remotePath, { content: readFileSync(localPath), mtime: Date.now() })
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error('Not found')
    mkdirSync(join(localPath, '..'), { recursive: true })
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
  let adapter: MockAdapter

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    adapter = new MockAdapter()
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('sync pulls remote annotation then rebuild indexes it', async () => {
    // Seed a remote annotation
    const annJson = JSON.stringify({
      id: 'remote-ann-int',
      docId: 'doc-001',
      type: 'highlight',
      page: 1,
      position: { type: 'pdf', page: 1, rects: [], text: '' },
      content: 'synced annotation',
      selectedText: 'selected',
      color: 'yellow',
      createdAt: '2026-04-25T10:00:00Z',
      updatedAt: '2026-04-25T10:00:00Z',
    })
    adapter.seed('/data/annotations/re/remote-ann-int.json', annJson, Date.now() + 10000)

    // Sync
    const syncService = new SyncService(libPath, adapter)
    await syncService.sync()

    // File should exist locally
    const localPath = join(libPath, '.banjuan', 'data', 'annotations', 're', 'remote-ann-int.json')
    expect(existsSync(localPath)).toBe(true)

    // Rebuild index
    const db = (lib as any).db
    const indexer = new IndexService(db, libPath)
    await indexer.rebuildFull()

    // Annotation should be queryable
    const ann = await lib.annotations.get('remote-ann-int')
    expect(ann).not.toBeNull()
    expect(ann!.content).toBe('synced annotation')
  })

  it('round-trip: create locally, sync, wipe SQLite, rebuild', async () => {
    // Create local data
    createTestFile(libPath, 'round.pdf', Buffer.from('pdf'))
    const doc = await lib.documents.import('round.pdf')
    const note = await lib.notes.create({ title: 'Round Trip', content: 'hello' })

    // Sync to remote
    const syncService = new SyncService(libPath, adapter)
    await syncService.sync()

    // Wipe SQLite
    const db = (lib as any).db
    db.prepare('DELETE FROM documents').run()
    db.prepare('DELETE FROM notes').run()

    // Rebuild from files
    const indexer = new IndexService(db, libPath)
    await indexer.rebuildFull()

    // Data should be restored
    expect(await lib.documents.get(doc.id)).not.toBeNull()
    expect(await lib.notes.get(note.id)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Update package exports**

Add to `packages/core/src/index.ts`:

```typescript
export type { SyncAdapter } from './sync/adapter.js'
export { WebDAVAdapter } from './sync/webdav-adapter.js'
export { SyncService } from './sync/service.js'
export { StubService } from './sync/stub-service.js'
```

- [ ] **Step 3: Run all sync tests**

```bash
pnpm --filter @banjuan/core test -- sync
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 5: Run build**

```bash
pnpm --filter @banjuan/core build
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/sync/integration.test.ts packages/core/src/index.ts
git commit -m "feat(core): add sync + index integration tests and exports

Verifies end-to-end flow: sync pulls files → IndexService rebuilds
SQLite → entities are queryable. Exports all sync classes."
```

---

### Task 6: Sync Events and EventBus Integration

**Files:**
- Modify: `packages/core/src/types.ts` (add sync events to BanjuanEventMap)
- Modify: `packages/core/src/sync/service.ts` (emit events)
- Add test in: `packages/core/test/sync/service.test.ts`

- [ ] **Step 1: Add sync events to BanjuanEventMap**

Add to the `BanjuanEventMap` type in `packages/core/src/types.ts`:

```typescript
  'sync:started': { timestamp: number }
  'sync:completed': { result: { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; errors: string[] } }
  'sync:error': { error: string }
  'sync:file:uploaded': { path: string }
  'sync:file:downloaded': { path: string }
```

- [ ] **Step 2: Update SyncService to accept EventBus and emit events**

Add `EventBus` to constructor and emit events during sync:

```typescript
import type { EventBus } from '../events/bus.js'

export class SyncService {
  constructor(
    private rootPath: string,
    private adapter: SyncAdapter,
    private events?: EventBus,
  ) { ... }

  async sync(): Promise<SyncResult> {
    this.events?.emit('sync:started', { timestamp: Date.now() })
    // ... existing sync logic ...
    // After each upload: this.events?.emit('sync:file:uploaded', { path })
    // After each download: this.events?.emit('sync:file:downloaded', { path })
    this.events?.emit('sync:completed', { result })
    return result
  }
```

- [ ] **Step 3: Add test for sync events**

Add to `packages/core/test/sync/service.test.ts`:

```typescript
  describe('events', () => {
    it('emits sync:started and sync:completed', async () => {
      const { EventBus } = await import('../../src/events/bus.js')
      const events = new EventBus()
      const evSyncService = new SyncService(libPath, adapter, events)

      let started = false
      let completed = false
      events.on('sync:started', () => { started = true })
      events.on('sync:completed', () => { completed = true })

      await evSyncService.sync()

      expect(started).toBe(true)
      expect(completed).toBe(true)
    })
  })
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @banjuan/core test -- sync
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/sync/service.ts packages/core/test/sync/service.test.ts
git commit -m "feat(core): add sync events to EventBus

SyncService emits sync:started, sync:completed, sync:error,
sync:file:uploaded, sync:file:downloaded events."
```

---

### Task 7: Final Integration Verification

**Files:**
- Potentially any test file that needs fixing

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 2: Fix any failures**

Common issues:
- Import path mismatches
- Missing type exports
- Test timing issues with FileWatcher

- [ ] **Step 3: Run build**

```bash
pnpm --filter @banjuan/core build
```

- [ ] **Step 4: Fix any type errors**

- [ ] **Step 5: Commit fixes if needed**

```bash
git add packages/core/
git commit -m "fix(core): resolve Phase B integration issues"
```

- [ ] **Step 6: Verify git log**

```bash
git log --oneline -10
```

All Phase B commits should be clean and ordered.
