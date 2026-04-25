# Phase C: UI + CLI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire sync, stub, and index-rebuild capabilities into the Electron app UI and CLI so users can configure WebDAV sync, see document sync status, download/upload large files, and run sync from the command line.

**Architecture:** IPC handlers in main process delegate to core services (SyncService, StubService, IndexService). Preload exposes a `sync` namespace to renderer. CLI adds a `banjuan sync` command with push/pull/status subcommands. Library gains a convenience method to create sync service instances from persisted config. App triggers index rebuild on startup.

**Tech Stack:** Electron (IPC), React (renderer), commander.js (CLI), @banjuan/core (SyncService, StubService, IndexService, WebDAVAdapter)

---

### Task 1: Fix stale `documents` directory references in ipc.ts

**Files:**
- Modify: `packages/app/src/main/ipc.ts:57-66`

The `documents:getFilePath` and `documents:readContent` handlers incorrectly join `'documents'` subdirectory into the path. In the file-first architecture, document `path` is relative to `rootPath` directly (e.g., `机器学习/attention.pdf`).

- [ ] **Step 1: Write test expectations**

No automated test — this is a bug fix in IPC wiring. Verify manually that the paths resolve correctly.

- [ ] **Step 2: Fix `documents:getFilePath`**

In `packages/app/src/main/ipc.ts`, replace:

```typescript
ipcMain.handle('documents:getFilePath', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  return join(library.rootPath, 'documents', relativePath)
})
```

With:

```typescript
ipcMain.handle('documents:getFilePath', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  return join(library.rootPath, relativePath)
})
```

- [ ] **Step 3: Fix `documents:readContent`**

Replace:

```typescript
ipcMain.handle('documents:readContent', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  const fullPath = join(library.rootPath, 'documents', relativePath)
  return readFileSync(fullPath, 'utf-8')
})
```

With:

```typescript
ipcMain.handle('documents:readContent', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  const fullPath = join(library.rootPath, relativePath)
  return readFileSync(fullPath, 'utf-8')
})
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "fix(app): remove stale 'documents' subdirectory from file path handlers"
```

---

### Task 2: Add sync helper methods to Library

**Files:**
- Modify: `packages/core/src/library.ts`
- Test: `packages/core/test/library-sync.test.ts`

Library needs convenience methods to read/write sync config from `.banjuan/sync.json` and create SyncService/StubService instances. This avoids the app/CLI having to know internal paths.

- [ ] **Step 1: Write failing test**

Create `packages/core/test/library-sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir } from './helpers.js'

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

  it('getSyncConfig returns null when no sync.json', () => {
    expect(lib.getSyncConfig()).toBeNull()
  })

  it('saveSyncConfig writes sync.json and getSyncConfig reads it', () => {
    const config = {
      type: 'webdav' as const,
      url: 'https://dav.example.com',
      username: 'user',
      password: 'pass',
      remotePath: '/banjuan',
    }
    lib.saveSyncConfig(config)

    const raw = JSON.parse(readFileSync(join(libPath, '.banjuan', 'sync.json'), 'utf-8'))
    expect(raw.url).toBe('https://dav.example.com')

    const read = lib.getSyncConfig()
    expect(read).toEqual(config)
  })

  it('createSyncService returns a SyncService when config exists', () => {
    lib.saveSyncConfig({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'user',
      password: 'pass',
      remotePath: '/banjuan',
    })
    const svc = lib.createSyncService()
    expect(svc).toBeDefined()
  })

  it('createSyncService throws when no config', () => {
    expect(() => lib.createSyncService()).toThrow()
  })

  it('createStubService returns a StubService when config exists', () => {
    lib.saveSyncConfig({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'user',
      password: 'pass',
      remotePath: '/banjuan',
    })
    const svc = lib.createStubService()
    expect(svc).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/library-sync.test.ts`
Expected: FAIL — `getSyncConfig` is not a function

- [ ] **Step 3: Implement Library sync helpers**

Add imports to `packages/core/src/library.ts`:

```typescript
import { readFileSync, writeFileSync } from 'node:fs'
import type { SyncConfig } from './types.js'
import { WebDAVAdapter } from './sync/webdav-adapter.js'
import { SyncService } from './sync/service.js'
import { StubService } from './sync/stub-service.js'
```

Add methods to the `Library` class:

```typescript
getSyncConfig(): SyncConfig | null {
  const configPath = join(this.rootPath, '.banjuan', 'sync.json')
  if (!existsSync(configPath)) return null
  return JSON.parse(readFileSync(configPath, 'utf-8'))
}

saveSyncConfig(config: SyncConfig): void {
  const configPath = join(this.rootPath, '.banjuan', 'sync.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

createSyncService(): SyncService {
  const config = this.getSyncConfig()
  if (!config) throw new Error('No sync configuration found — save config first')
  const adapter = new WebDAVAdapter()
  return new SyncService(this.rootPath, adapter, this.events)
}

createStubService(): StubService {
  const config = this.getSyncConfig()
  if (!config) throw new Error('No sync configuration found — save config first')
  const adapter = new WebDAVAdapter()
  return new StubService(this.rootPath, adapter)
}
```

Note: `readFileSync` is already imported; add `writeFileSync` to the existing import. Keep `existsSync` and `mkdirSync` in the existing import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/library-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library.ts packages/core/test/library-sync.test.ts
git commit -m "feat(core): add sync config helpers and service factory to Library"
```

---

### Task 3: Add sync + stub IPC handlers

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

Add IPC handlers for sync operations: configure, run sync, get status, stub management, and index rebuild.

- [ ] **Step 1: Add IndexService import**

At the top of `ipc.ts`, add:

```typescript
import { IndexService } from '@banjuan/core'
```

- [ ] **Step 2: Add sync IPC handlers after existing handlers**

Before the `setLibraryGetter(...)` line, add:

```typescript
ipcMain.handle('sync:getConfig', async () => {
  if (!library) throw new Error('No library open')
  return library.getSyncConfig()
})

ipcMain.handle('sync:saveConfig', async (_event, config: {
  type: 'webdav'; url: string; username: string; password: string; remotePath: string
}) => {
  if (!library) throw new Error('No library open')
  library.saveSyncConfig(config)
})

ipcMain.handle('sync:run', async () => {
  if (!library) throw new Error('No library open')
  const svc = library.createSyncService()
  const config = library.getSyncConfig()!
  const adapter = (svc as any).adapter
  await adapter.connect(config)
  try {
    const result = await svc.sync()
    const indexService = new IndexService(library as any)
    await indexService.rebuildFull()
    return result
  } finally {
    await adapter.disconnect()
  }
})

ipcMain.handle('sync:stubList', async () => {
  if (!library) throw new Error('No library open')
  const svc = library.createStubService()
  return svc.listStubs()
})

ipcMain.handle('sync:stubDownload', async (_event, docId: string) => {
  if (!library) throw new Error('No library open')
  const doc = await library.documents.get(docId)
  if (!doc) throw new Error('Document not found')
  const svc = library.createStubService()
  const config = library.getSyncConfig()!
  const adapter = (svc as any).adapter
  await adapter.connect(config)
  try {
    const localPath = join(library.rootPath, doc.path)
    await svc.downloadFile(docId, localPath)
  } finally {
    await adapter.disconnect()
  }
})

ipcMain.handle('sync:stubUpload', async (_event, docId: string) => {
  if (!library) throw new Error('No library open')
  const doc = await library.documents.get(docId)
  if (!doc) throw new Error('Document not found')
  const svc = library.createStubService()
  const config = library.getSyncConfig()!
  const adapter = (svc as any).adapter
  await adapter.connect(config)
  try {
    const localPath = join(library.rootPath, doc.path)
    await svc.uploadFile(localPath, doc.path)
  } finally {
    await adapter.disconnect()
  }
})

ipcMain.handle('sync:getDocStatus', async (_event, docId: string) => {
  if (!library) throw new Error('No library open')
  const doc = await library.documents.get(docId)
  if (!doc) return 'local'
  const config = library.getSyncConfig()
  if (!config) return 'local'
  const svc = library.createStubService()
  return svc.getStatus(docId, join(library.rootPath, doc.path))
})

ipcMain.handle('index:rebuild', async () => {
  if (!library) throw new Error('No library open')
  const indexService = new IndexService(library as any)
  await indexService.rebuildFull()
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(app): add sync, stub, and index rebuild IPC handlers"
```

---

### Task 4: Update preload with sync API

**Files:**
- Modify: `packages/app/src/preload/index.ts`

Expose the sync API to the renderer process.

- [ ] **Step 1: Add sync namespace to the api object**

After the `plugins` namespace, add:

```typescript
sync: {
  getConfig: () => ipcRenderer.invoke('sync:getConfig'),
  saveConfig: (config: {
    type: 'webdav'; url: string; username: string; password: string; remotePath: string
  }) => ipcRenderer.invoke('sync:saveConfig', config),
  run: () => ipcRenderer.invoke('sync:run'),
  stubList: () => ipcRenderer.invoke('sync:stubList'),
  stubDownload: (docId: string) => ipcRenderer.invoke('sync:stubDownload', docId),
  stubUpload: (docId: string) => ipcRenderer.invoke('sync:stubUpload', docId),
  getDocStatus: (docId: string) => ipcRenderer.invoke('sync:getDocStatus', docId),
},
index: {
  rebuild: () => ipcRenderer.invoke('index:rebuild'),
},
```

- [ ] **Step 2: Update type declarations if they exist**

Check for a `src/preload/types.d.ts` or `src/renderer/electron.d.ts` and add the sync types. If no type declaration file exists, create `packages/app/src/renderer/electron.d.ts`:

```typescript
interface SyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  remotePath: string
}

interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  errors: string[]
}

interface StubData {
  id: string
  hash: string
  size: number
  remotePath: string
  createdAt: string
}

interface ElectronAPI {
  library: {
    init: (path: string) => Promise<{ rootPath: string }>
    open: (path: string) => Promise<{ rootPath: string }>
    isOpen: () => Promise<boolean>
  }
  dialog: {
    openDirectory: () => Promise<string | null>
  }
  documents: {
    import: () => Promise<any>
    list: (options?: Record<string, unknown>) => Promise<any[]>
    get: (id: string) => Promise<any>
    delete: (id: string) => Promise<void>
    getFilePath: (relativePath: string) => Promise<string>
    readContent: (relativePath: string) => Promise<string>
  }
  tags: {
    list: () => Promise<any[]>
    create: (input: { name: string; color?: string }) => Promise<any>
    forTarget: (id: string, type: string) => Promise<any[]>
  }
  annotations: {
    create: (input: any) => Promise<any>
    list: (options: any) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: any) => Promise<any>
    delete: (id: string) => Promise<void>
  }
  notes: {
    create: (input: any) => Promise<any>
    list: (options?: any) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: any) => Promise<any>
    delete: (id: string) => Promise<void>
    getAnnotations: (noteId: string) => Promise<any[]>
  }
  mindmaps: {
    create: (input: any) => Promise<any>
    list: (options?: any) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: any) => Promise<any>
    delete: (id: string) => Promise<void>
    addNode: (mindmapId: string, input: any) => Promise<any>
    getNodes: (mindmapId: string) => Promise<any[]>
    updateNode: (id: string, updates: any) => Promise<any>
    removeNode: (id: string) => Promise<void>
    addEdge: (mindmapId: string, input: any) => Promise<any>
    getEdges: (mindmapId: string) => Promise<any[]>
    removeEdge: (id: string) => Promise<void>
  }
  graph: {
    getData: () => Promise<any>
  }
  plugins: {
    list: () => Promise<any[]>
    loadAll: () => Promise<void>
    unload: (pluginId: string) => Promise<void>
    getCommands: () => Promise<any[]>
    runCommand: (commandId: string) => Promise<void>
  }
  sync: {
    getConfig: () => Promise<SyncConfig | null>
    saveConfig: (config: SyncConfig) => Promise<void>
    run: () => Promise<SyncResult>
    stubList: () => Promise<StubData[]>
    stubDownload: (docId: string) => Promise<void>
    stubUpload: (docId: string) => Promise<void>
    getDocStatus: (docId: string) => Promise<string>
  }
  index: {
    rebuild: () => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/preload/index.ts packages/app/src/renderer/electron.d.ts
git commit -m "feat(app): expose sync and index APIs in preload"
```

---

### Task 5: CLI `banjuan sync` command

**Files:**
- Create: `packages/cli/src/commands/sync.ts`
- Modify: `packages/cli/src/index.ts`

Add CLI sync command with `push`, `pull`, `status`, and `config` subcommands.

- [ ] **Step 1: Create `packages/cli/src/commands/sync.ts`**

```typescript
import { Command } from 'commander'
import chalk from 'chalk'
import { openLibrary } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

export const syncCmd = new Command('sync').description('同步管理')

syncCmd
  .command('config')
  .description('配置 WebDAV 同步')
  .requiredOption('--url <url>', 'WebDAV 地址')
  .requiredOption('--username <username>', '用户名')
  .requiredOption('--password <password>', '密码')
  .option('--remote-path <path>', '远程路径', '/banjuan')
  .action(async (opts: { url: string; username: string; password: string; remotePath: string }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      lib.saveSyncConfig({
        type: 'webdav',
        url: opts.url,
        username: opts.username,
        password: opts.password,
        remotePath: opts.remotePath,
      })
      console.log(chalk.green('✓ 同步配置已保存'))
    } finally {
      await lib.close()
    }
  })

syncCmd
  .command('run')
  .description('执行双向同步')
  .action(async (_opts: unknown, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const config = lib.getSyncConfig()
      if (!config) {
        console.error('未配置同步，请先运行 banjuan sync config')
        process.exit(1)
      }

      const svc = lib.createSyncService()
      const { WebDAVAdapter } = await import('@banjuan/core')
      const adapter = new WebDAVAdapter()
      await adapter.connect(config)

      try {
        console.log('正在同步...')
        const result = await svc.sync()
        console.log(chalk.green('✓ 同步完成'))
        console.log(`  上传: ${result.uploaded}  下载: ${result.downloaded}`)
        console.log(`  本地删除: ${result.deletedLocal}  远程删除: ${result.deletedRemote}`)
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`  错误: ${result.errors.length}`))
          for (const err of result.errors) {
            console.log(chalk.yellow(`    - ${err}`))
          }
        }
      } finally {
        await adapter.disconnect()
      }
    } finally {
      await lib.close()
    }
  })

syncCmd
  .command('status')
  .description('查看同步状态')
  .option('--json', 'JSON 输出')
  .action(async (opts: { json?: boolean }, cmd: Command) => {
    const lib = openLibrary(cmd.optsWithGlobals())
    try {
      const config = lib.getSyncConfig()
      if (!config) {
        console.log('未配置同步')
        return
      }

      console.log(`WebDAV: ${config.url}`)
      console.log(`用户: ${config.username}`)
      console.log(`远程路径: ${config.remotePath}`)

      const svc = lib.createStubService()
      const stubs = svc.listStubs()
      if (stubs.length > 0) {
        console.log(`\n待下载文件 (${stubs.length}):`)
        if (opts.json) {
          outputJson(stubs)
        } else {
          outputTable(
            ['ID', '远程路径', '大小', '创建时间'],
            stubs.map(s => [
              s.id.slice(0, 8),
              s.remotePath,
              formatSize(s.size),
              new Date(s.createdAt).toLocaleDateString('zh-CN'),
            ]),
          )
        }
      } else {
        console.log('\n所有文件已同步')
      }
    } finally {
      await lib.close()
    }
  })

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

- [ ] **Step 2: Register sync command in CLI entry**

In `packages/cli/src/index.ts`, add:

```typescript
import { syncCmd } from './commands/sync.js'
```

And after the last `program.addCommand(...)`:

```typescript
program.addCommand(syncCmd)
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/cli && npm run build`
Run: `node dist/index.js sync --help`
Expected: Shows sync subcommands (config, run, status)

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/sync.ts packages/cli/src/index.ts
git commit -m "feat(cli): add banjuan sync command with config/run/status"
```

---

### Task 6: Sync configuration UI component

**Files:**
- Create: `packages/app/src/renderer/components/sync/SyncConfigPanel.tsx`

A panel for configuring WebDAV sync settings. Shows current config if saved, allows editing and saving.

- [ ] **Step 1: Create SyncConfigPanel**

```tsx
import React, { useEffect, useState } from 'react'

interface SyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  remotePath: string
}

export default function SyncConfigPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<SyncConfig>({
    type: 'webdav',
    url: '',
    username: '',
    password: '',
    remotePath: '/banjuan',
  })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.sync.getConfig().then((c) => {
      if (c) setConfig(c)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await window.electronAPI.sync.saveConfig(config)
      setMessage('配置已保存')
    } catch (err: any) {
      setMessage(`保存失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.sync.run()
      setMessage(
        `同步完成 — 上传 ${result.uploaded}, 下载 ${result.downloaded}` +
        (result.errors.length > 0 ? `, ${result.errors.length} 个错误` : ''),
      )
    } catch (err: any) {
      setMessage(`同步失败: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>同步配置</h3>
        <button onClick={onClose} style={{ fontSize: 12 }}>关闭</button>
      </div>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>WebDAV 地址</span>
        <input
          type="text"
          value={config.url}
          onChange={(e) => setConfig({ ...config, url: e.target.value })}
          placeholder="https://dav.example.com/remote.php/webdav"
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>用户名</span>
        <input
          type="text"
          value={config.username}
          onChange={(e) => setConfig({ ...config, username: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>密码</span>
        <input
          type="password"
          value={config.password}
          onChange={(e) => setConfig({ ...config, password: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>远程路径</span>
        <input
          type="text"
          value={config.remotePath}
          onChange={(e) => setConfig({ ...config, remotePath: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primary" onClick={handleSave} disabled={saving || !config.url}>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button onClick={handleSync} disabled={syncing || !config.url}>
          {syncing ? '同步中...' : '立即同步'}
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 12, fontSize: 13, color: message.includes('失败') ? '#f38ba8' : '#a6e3a1' }}>
          {message}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/sync/SyncConfigPanel.tsx
git commit -m "feat(app): add SyncConfigPanel component"
```

---

### Task 7: Document list with stub status + download/upload

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

Add sync status badges to document cards and download/upload buttons for stub documents. Also add a "同步" button in the sidebar to open the sync config panel.

- [ ] **Step 1: Add imports and state**

At the top of `LibraryView.tsx`, add the import:

```typescript
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'
```

Add to the Document interface:

```typescript
interface Document {
  id: string
  title: string
  type: string
  path: string
  createdAt: string
}
```

Add state variables inside the component:

```typescript
const [showSync, setShowSync] = useState(false)
const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Load document sync statuses**

Add a function after `loadMindmaps`:

```typescript
const loadDocStatuses = async (docs: Document[]) => {
  const statuses: Record<string, string> = {}
  for (const doc of docs) {
    try {
      statuses[doc.id] = await window.electronAPI.sync.getDocStatus(doc.id)
    } catch {
      statuses[doc.id] = 'local'
    }
  }
  setDocStatuses(statuses)
}
```

Update `loadDocuments` to also load statuses:

```typescript
const loadDocuments = async () => {
  const docs = await window.electronAPI.documents.list()
  setDocuments(docs)
  loadDocStatuses(docs)
}
```

- [ ] **Step 3: Add download/upload handlers**

```typescript
const handleDownload = async (docId: string) => {
  try {
    await window.electronAPI.sync.stubDownload(docId)
    await loadDocuments()
  } catch (err: any) {
    alert(`下载失败: ${err.message}`)
  }
}

const handleUpload = async (docId: string) => {
  try {
    await window.electronAPI.sync.stubUpload(docId)
    await loadDocuments()
  } catch (err: any) {
    alert(`上传失败: ${err.message}`)
  }
}
```

- [ ] **Step 4: Add sync button to sidebar**

After the plugins button, add:

```tsx
<button onClick={() => setShowSync(s => !s)} style={{ marginTop: 8, width: '100%' }}>
  同步
</button>
```

- [ ] **Step 5: Add sync config panel render**

If `showSync` is true, render the sync config panel instead of the document grid:

```tsx
{showSync ? (
  <SyncConfigPanel onClose={() => { setShowSync(false); loadDocuments() }} />
) : (
  <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
    {/* existing document grid content */}
  </div>
)}
```

- [ ] **Step 6: Add status badges and action buttons to document cards**

In the document card, add a status badge after the type badge:

```tsx
{docStatuses[doc.id] === 'cloud' && (
  <span style={{ fontSize: 11, color: '#89b4fa', marginLeft: 8 }}>☁️ 云端</span>
)}
{docStatuses[doc.id] === 'synced' && (
  <span style={{ fontSize: 11, color: '#a6e3a1', marginLeft: 8 }}>✓ 已同步</span>
)}
```

Add download/upload buttons:

```tsx
{docStatuses[doc.id] === 'cloud' && (
  <button
    onClick={(e) => { e.stopPropagation(); handleDownload(doc.id) }}
    style={{ marginTop: 4, fontSize: '12px', marginRight: 4 }}
  >
    下载
  </button>
)}
{docStatuses[doc.id] === 'local' && (
  <button
    onClick={(e) => { e.stopPropagation(); handleUpload(doc.id) }}
    style={{ marginTop: 4, fontSize: '12px', marginRight: 4 }}
  >
    上传
  </button>
)}
```

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "feat(app): add sync status, download/upload buttons, and sync panel to LibraryView"
```

---

### Task 8: Trigger index rebuild on app startup

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

After library is opened or initialized, trigger an index rebuild so the SQLite cache is fresh.

- [ ] **Step 1: Add index rebuild to library:open and library:init handlers**

In the `library:open` handler, after `await library.plugins.loadAll()`, add:

```typescript
const indexService = new IndexService(library as any)
await indexService.rebuildFull()
```

Do the same in the `library:init` handler (though init starts with an empty library, this ensures consistency).

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(app): trigger index rebuild on library open/init"
```

---

### Task 9: Build verification and integration test

**Files:**
- Test: `packages/core/test/sync-integration.test.ts` (verify existing)

- [ ] **Step 1: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass (including the new library-sync tests from Task 2)

- [ ] **Step 2: Build all packages**

Run: `npm run build` (or the workspace build command)
Expected: Clean build with no TypeScript errors

- [ ] **Step 3: Verify CLI builds**

Run: `cd packages/cli && npm run build`
Run: `node dist/index.js sync --help`
Expected: Shows config/run/status subcommands

- [ ] **Step 4: Commit any fixes if needed**

If any build or test issues are found, fix and commit.
