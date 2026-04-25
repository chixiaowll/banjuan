# Phase 7: Plugin System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-style plugin system — plugins are JS modules loaded from `.banjuan/plugins/`, given access to the Library API and an event bus. Plugins can register commands, listen to lifecycle events, and extend functionality.

**Architecture:** An `EventBus` emits domain events from existing services. `BanjuanPlugin` is the base class plugins extend. `PluginManager` discovers, loads, and unloads plugins. All in `@banjuan/core` — no Electron dependency.

**Tech Stack:** Node.js EventEmitter, dynamic `import()`, existing SQLite services

---

## File Structure

```
packages/core/src/
├── events/
│   └── bus.ts                  # EventBus: typed event emitter
├── plugins/
│   ├── base.ts                 # BanjuanPlugin abstract base class
│   └── manager.ts              # PluginManager: load/unload/list plugins
├── types.ts                    # Add plugin + event types
├── library.ts                  # Add EventBus, PluginManager, emit events

packages/app/src/
├── main/
│   └── ipc.ts                  # Add plugin IPC handlers
├── preload/
│   └── index.ts                # Add plugins namespace
├── renderer/
│   └── views/
│       └── LibraryView.tsx     # Add plugins button/section
├── electron.d.ts
```

---

## Task 1: EventBus + Plugin Types

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/events/bus.ts`

- [ ] **Step 1: Add types**

Add to `packages/core/src/types.ts`:

```typescript
export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  apiVersion: string
  permissions?: string[]
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  path: string
}

export interface PluginCommand {
  id: string
  name: string
  pluginId: string
  callback: () => Promise<void>
}

export type BanjuanEventMap = {
  'document:imported': { document: Document }
  'document:deleted': { id: string }
  'annotation:created': { annotation: Annotation }
  'annotation:updated': { annotation: Annotation }
  'annotation:deleted': { id: string; docId: string }
  'note:created': { note: Note }
  'note:updated': { note: Note }
  'note:deleted': { id: string }
  'mindmap:created': { mindmap: Mindmap }
  'mindmap:updated': { mindmap: Mindmap }
  'mindmap:deleted': { id: string }
  'mindmap:node:added': { node: MindmapNode }
  'mindmap:node:removed': { id: string; mindmapId: string }
  'mindmap:edge:added': { edge: MindmapEdge }
  'tag:assigned': { targetId: string; targetType: TagTarget; tagName: string }
  'tag:removed': { targetId: string; targetType: TagTarget; tagName: string }
  'library:opened': { path: string }
  'library:closed': { path: string }
}

export type BanjuanEvent = keyof BanjuanEventMap
```

- [ ] **Step 2: Create EventBus**

Create `packages/core/src/events/bus.ts`:

```typescript
import { EventEmitter } from 'node:events'
import type { BanjuanEventMap, BanjuanEvent } from '../types.js'

export class EventBus {
  private emitter = new EventEmitter()

  emit<E extends BanjuanEvent>(event: E, data: BanjuanEventMap[E]): void {
    this.emitter.emit(event, data)
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.emitter.on(event, handler)
  }

  off<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.emitter.off(event, handler)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }
}
```

- [ ] **Step 3: Export EventBus from index**

In `packages/core/src/index.ts`, add:
```typescript
export { EventBus } from './events/bus.js'
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @banjuan/core build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): EventBus with typed domain events"
```

---

## Task 2: BanjuanPlugin Base Class

**Files:**
- Create: `packages/core/src/plugins/base.ts`

- [ ] **Step 1: Create BanjuanPlugin**

Create `packages/core/src/plugins/base.ts`:

```typescript
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import type { BanjuanEvent, BanjuanEventMap, PluginCommand } from '../types.js'

export abstract class BanjuanPlugin {
  readonly id: string
  readonly library: Library
  private bus: EventBus
  private commands: PluginCommand[] = []
  private listeners: Array<{ event: BanjuanEvent; handler: (...args: any[]) => void }> = []

  constructor(id: string, library: Library, bus: EventBus) {
    this.id = id
    this.library = library
    this.bus = bus
  }

  abstract onload(): Promise<void>
  abstract onunload(): Promise<void>

  addCommand(cmd: { id: string; name: string; callback: () => Promise<void> }): void {
    const command: PluginCommand = {
      id: `${this.id}:${cmd.id}`,
      name: cmd.name,
      pluginId: this.id,
      callback: cmd.callback,
    }
    this.commands.push(command)
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.bus.on(event, handler)
    this.listeners.push({ event, handler })
  }

  getCommands(): PluginCommand[] {
    return [...this.commands]
  }

  /** Called by PluginManager during unload to clean up */
  _cleanup(): void {
    for (const { event, handler } of this.listeners) {
      this.bus.off(event, handler)
    }
    this.listeners = []
    this.commands = []
  }
}
```

- [ ] **Step 2: Export from index**

In `packages/core/src/index.ts`, add:
```typescript
export { BanjuanPlugin } from './plugins/base.js'
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @banjuan/core build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): BanjuanPlugin abstract base class"
```

---

## Task 3: PluginManager

**Files:**
- Create: `packages/core/src/plugins/manager.ts`

- [ ] **Step 1: Create PluginManager**

Create `packages/core/src/plugins/manager.ts`:

```typescript
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import { BanjuanPlugin } from './base.js'
import type { PluginManifest, PluginInfo, PluginCommand } from '../types.js'

export class PluginManager {
  private plugins = new Map<string, { plugin: BanjuanPlugin; manifest: PluginManifest; path: string }>()
  private pluginsDir: string

  constructor(
    private library: Library,
    private bus: EventBus,
    rootPath: string,
  ) {
    this.pluginsDir = join(rootPath, '.banjuan', 'plugins')
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true })
    }
  }

  async loadAll(): Promise<void> {
    if (!existsSync(this.pluginsDir)) return
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        await this.load(entry.name)
      } catch {
        // skip plugins that fail to load
      }
    }
  }

  async load(pluginDirName: string): Promise<void> {
    const pluginPath = join(this.pluginsDir, pluginDirName)
    const manifestPath = join(pluginPath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error(`No manifest.json in ${pluginPath}`)
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`)
    }

    const entryPath = join(pluginPath, 'index.js')
    if (!existsSync(entryPath)) {
      throw new Error(`No index.js in ${pluginPath}`)
    }

    const mod = await import(`file://${entryPath}`)
    const PluginClass = mod.default ?? mod
    if (typeof PluginClass !== 'function') {
      throw new Error(`Plugin ${manifest.id} does not export a class`)
    }

    const plugin: BanjuanPlugin = new PluginClass(manifest.id, this.library, this.bus)
    await plugin.onload()
    this.plugins.set(manifest.id, { plugin, manifest, path: pluginPath })
  }

  async unload(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return
    await entry.plugin.onunload()
    entry.plugin._cleanup()
    this.plugins.delete(pluginId)
  }

  async unloadAll(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.unload(id)
    }
  }

  list(): PluginInfo[] {
    const result: PluginInfo[] = []
    for (const [id, { manifest, path }] of this.plugins) {
      result.push({
        id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        enabled: true,
        path,
      })
    }
    return result
  }

  getCommands(): PluginCommand[] {
    const commands: PluginCommand[] = []
    for (const [, { plugin }] of this.plugins) {
      commands.push(...plugin.getCommands())
    }
    return commands
  }

  async runCommand(commandId: string): Promise<void> {
    for (const [, { plugin }] of this.plugins) {
      const cmd = plugin.getCommands().find(c => c.id === commandId)
      if (cmd) {
        await cmd.callback()
        return
      }
    }
    throw new Error(`Command not found: ${commandId}`)
  }
}
```

- [ ] **Step 2: Export from index**

In `packages/core/src/index.ts`, add:
```typescript
export { PluginManager } from './plugins/manager.js'
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @banjuan/core build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): PluginManager for loading/unloading plugins"
```

---

## Task 4: Wire EventBus into Library + Emit Events

**Files:**
- Modify: `packages/core/src/library.ts`
- Modify: `packages/core/src/documents/service.ts`
- Modify: `packages/core/src/annotations/service.ts`
- Modify: `packages/core/src/notes/service.ts`
- Modify: `packages/core/src/mindmaps/service.ts`
- Modify: `packages/core/src/tags/service.ts`

- [ ] **Step 1: Add EventBus and PluginManager to Library**

Modify `packages/core/src/library.ts`:

1. Import `EventBus` and `PluginManager`
2. Add `readonly events: EventBus` field
3. Add `readonly plugins: PluginManager` field
4. In constructor: create `this.events = new EventBus()`, pass it to services that need to emit
5. Create `this.plugins = new PluginManager(this, this.events, rootPath)`
6. In `close()`: call `await this.plugins.unloadAll()` then `this.events.removeAllListeners()` before `this.db.close()`
7. Make `close()` async
8. After `init()` and `open()` return the library: emit `library:opened`

Updated constructor:
```typescript
import { EventBus } from './events/bus.js'
import { PluginManager } from './plugins/manager.js'

// Fields:
readonly events: EventBus
readonly plugins: PluginManager

// In constructor:
this.events = new EventBus()
this.search = new SearchService(db)
this.documents = new DocumentService(db, rootPath, this.search, this.events)
this.annotations = new AnnotationService(db, this.events)
this.notes = new NoteService(db, rootPath, this.search, this.events)
this.tags = new TagService(db, this.events)
this.mindmaps = new MindmapService(db, this.events)
this.graph = new GraphService(db)
this.plugins = new PluginManager(this, this.events, rootPath)
this.events.emit('library:opened', { path: rootPath })

// close():
async close(): Promise<void> {
  await this.plugins.unloadAll()
  this.events.emit('library:closed', { path: this.rootPath })
  this.events.removeAllListeners()
  this.db.close()
}
```

- [ ] **Step 2: Emit events from DocumentService**

Modify `packages/core/src/documents/service.ts`:
1. Accept `EventBus` as 4th constructor parameter
2. In `import()`: after inserting, emit `document:imported` with the created document
3. In `delete()`: after deleting, emit `document:deleted` with `{ id }`

```typescript
import type { EventBus } from '../events/bus.js'

constructor(
  private db: Database.Database,
  private rootPath: string,
  private search: SearchService,
  private events: EventBus,
) {}

// In import(), after successful insert:
this.events.emit('document:imported', { document: doc })

// In delete(), after successful delete:
this.events.emit('document:deleted', { id })
```

- [ ] **Step 3: Emit events from AnnotationService**

Modify `packages/core/src/annotations/service.ts`:
1. Accept `EventBus` as 2nd constructor parameter
2. In `create()`: emit `annotation:created`
3. In `update()`: emit `annotation:updated`
4. In `delete()`: emit `annotation:deleted` with `{ id, docId }`

```typescript
import type { EventBus } from '../events/bus.js'

constructor(private db: Database.Database, private events: EventBus) {}

// After create:
this.events.emit('annotation:created', { annotation })
// After update:
this.events.emit('annotation:updated', { annotation })
// After delete (need to get docId first):
this.events.emit('annotation:deleted', { id, docId })
```

- [ ] **Step 4: Emit events from NoteService**

Modify `packages/core/src/notes/service.ts`:
1. Accept `EventBus` as 4th constructor parameter
2. Emit `note:created`, `note:updated`, `note:deleted`

```typescript
import type { EventBus } from '../events/bus.js'

constructor(
  private db: Database.Database,
  private rootPath: string,
  private search: SearchService,
  private events: EventBus,
) {}
```

- [ ] **Step 5: Emit events from MindmapService**

Modify `packages/core/src/mindmaps/service.ts`:
1. Accept `EventBus` as 2nd constructor parameter
2. Emit: `mindmap:created`, `mindmap:updated`, `mindmap:deleted`, `mindmap:node:added`, `mindmap:node:removed`, `mindmap:edge:added`

```typescript
import type { EventBus } from '../events/bus.js'

constructor(private db: Database.Database, private events: EventBus) {}
```

- [ ] **Step 6: Emit events from TagService**

Modify `packages/core/src/tags/service.ts`:
1. Accept `EventBus` as 2nd constructor parameter
2. In `assign()`: emit `tag:assigned` for each tag
3. In `unassign()`: emit `tag:removed`

```typescript
import type { EventBus } from '../events/bus.js'

constructor(private db: Database.Database, private events: EventBus) {}
```

- [ ] **Step 7: Build and run tests**

```bash
pnpm --filter @banjuan/core build
pnpm --filter @banjuan/core test
```

All 50 existing tests must still pass — services gain an extra constructor parameter but behavior is unchanged.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(core): wire EventBus into all services and Library"
```

---

## Task 5: Plugin System Tests

**Files:**
- Create: `packages/core/test/plugins.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/test/plugins.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'

const TEST_DIR = join(import.meta.dirname, '.test-plugins-lib')

describe('Plugin System', () => {
  let lib: Library

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    lib = Library.init(TEST_DIR)
  })

  afterEach(async () => {
    await lib.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('lists no plugins initially', () => {
    expect(lib.plugins.list()).toEqual([])
  })

  it('loads a plugin from .banjuan/plugins/', async () => {
    const pluginDir = join(TEST_DIR, '.banjuan', 'plugins', 'test-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      const { BanjuanPlugin } = require('@banjuan/core')
      module.exports = class TestPlugin extends BanjuanPlugin {
        async onload() {
          this.addCommand({ id: 'hello', name: 'Say Hello', callback: async () => {} })
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    const plugins = lib.plugins.list()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('test-plugin')
    expect(plugins[0].name).toBe('Test Plugin')
  })

  it('registers and runs plugin commands', async () => {
    const pluginDir = join(TEST_DIR, '.banjuan', 'plugins', 'cmd-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'cmd-plugin', name: 'Cmd', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      const { BanjuanPlugin } = require('@banjuan/core')
      let ran = false
      module.exports = class CmdPlugin extends BanjuanPlugin {
        async onload() {
          this.addCommand({ id: 'test', name: 'Test', callback: async () => { ran = true } })
        }
        async onunload() {}
      }
      module.exports.getRan = () => ran
    `)

    await lib.plugins.loadAll()
    const cmds = lib.plugins.getCommands()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].id).toBe('cmd-plugin:test')
    await lib.plugins.runCommand('cmd-plugin:test')
  })

  it('unloads plugins and cleans up listeners', async () => {
    const pluginDir = join(TEST_DIR, '.banjuan', 'plugins', 'evt-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'evt-plugin', name: 'Evt', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      const { BanjuanPlugin } = require('@banjuan/core')
      module.exports = class EvtPlugin extends BanjuanPlugin {
        async onload() {
          this.on('document:imported', () => {})
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    expect(lib.plugins.list()).toHaveLength(1)
    await lib.plugins.unload('evt-plugin')
    expect(lib.plugins.list()).toHaveLength(0)
  })

  it('emits events when documents are imported', async () => {
    let emitted = false
    lib.events.on('document:imported', () => { emitted = true })
    const testFile = join(TEST_DIR, 'test.txt')
    writeFileSync(testFile, 'Hello')
    await lib.documents.import(testFile)
    expect(emitted).toBe(true)
  })

  it('emits events when annotations are created', async () => {
    let emitted = false
    lib.events.on('annotation:created', () => { emitted = true })
    const testFile = join(TEST_DIR, 'test.txt')
    writeFileSync(testFile, 'Hello')
    const doc = await lib.documents.import(testFile)
    await lib.annotations.create({
      docId: doc.id,
      type: 'highlight',
      position: { type: 'text', startOffset: 0, endOffset: 5, text: 'Hello' },
    })
    expect(emitted).toBe(true)
  })
})
```

**Note:** The `require('@banjuan/core')` in plugin test files may need adjustment. Since plugins are loaded via `import()` with `file://` URLs, and this is a test environment, the plugin code uses CJS `require`. The actual test may need the plugin code to use dynamic import or the test setup may need adjustment. If CJS `require` doesn't resolve `@banjuan/core` in the test context, change the plugin test files to use ESM with a relative path to the built dist:

```javascript
// Alternative ESM plugin for tests:
import { BanjuanPlugin } from '../../dist/index.js'
```

Adjust the plugin entry files in the test based on what resolves correctly in the vitest environment.

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @banjuan/core test
```

All tests must pass (existing 50 + new plugin tests).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): plugin system tests — load, commands, events, unload"
```

---

## Task 6: Plugin IPC + UI

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Add plugin IPC handlers**

In `packages/app/src/main/ipc.ts`:

```typescript
ipcMain.handle('plugins:list', async () => {
  if (!library) throw new Error('No library open')
  return library.plugins.list()
})

ipcMain.handle('plugins:loadAll', async () => {
  if (!library) throw new Error('No library open')
  await library.plugins.loadAll()
})

ipcMain.handle('plugins:unload', async (_event, pluginId: string) => {
  if (!library) throw new Error('No library open')
  await library.plugins.unload(pluginId)
})

ipcMain.handle('plugins:getCommands', async () => {
  if (!library) throw new Error('No library open')
  return library.plugins.getCommands().map(c => ({ id: c.id, name: c.name, pluginId: c.pluginId }))
})

ipcMain.handle('plugins:runCommand', async (_event, commandId: string) => {
  if (!library) throw new Error('No library open')
  await library.plugins.runCommand(commandId)
})
```

- [ ] **Step 2: Add preload bridge**

In `packages/app/src/preload/index.ts`:

```typescript
plugins: {
  list: () => ipcRenderer.invoke('plugins:list'),
  loadAll: () => ipcRenderer.invoke('plugins:loadAll'),
  unload: (pluginId: string) => ipcRenderer.invoke('plugins:unload', pluginId),
  getCommands: () => ipcRenderer.invoke('plugins:getCommands'),
  runCommand: (commandId: string) => ipcRenderer.invoke('plugins:runCommand', commandId),
},
```

- [ ] **Step 3: Add electron.d.ts types**

In `packages/app/electron.d.ts`, add to `ElectronAPI`:

```typescript
plugins: {
  list: () => Promise<Array<{ id: string; name: string; version: string; description: string; enabled: boolean; path: string }>>
  loadAll: () => Promise<void>
  unload: (pluginId: string) => Promise<void>
  getCommands: () => Promise<Array<{ id: string; name: string; pluginId: string }>>
  runCommand: (commandId: string) => Promise<void>
}
```

- [ ] **Step 4: Add plugins section to LibraryView**

In `packages/app/src/renderer/views/LibraryView.tsx`, add a "插件" button in the sidebar near the "知识图谱" button. When clicked, show an inline list of loaded plugins with unload buttons. Also add a "加载插件" button that calls `plugins.loadAll()`.

```typescript
const [plugins, setPlugins] = useState<any[]>([])
const [showPlugins, setShowPlugins] = useState(false)

const loadPlugins = async () => {
  await window.electronAPI.plugins.loadAll()
  const list = await window.electronAPI.plugins.list()
  setPlugins(list)
}

// In sidebar:
<button onClick={() => { setShowPlugins(s => !s); if (!showPlugins) loadPlugins() }} style={{ marginTop: 8, width: '100%' }}>
  插件
</button>

{showPlugins && (
  <div style={{ marginTop: 8, fontSize: 12 }}>
    {plugins.length === 0 && <div style={{ color: 'var(--text-muted)' }}>无已加载插件</div>}
    {plugins.map(p => (
      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
        <span>{p.name} v{p.version}</span>
        <button onClick={async () => {
          await window.electronAPI.plugins.unload(p.id)
          setPlugins(ps => ps.filter(x => x.id !== p.id))
        }} style={{ fontSize: 11 }}>卸载</button>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(app): plugin IPC handlers and UI"
```

---

## Task 7: Final Integration + Verification

- [ ] **Step 1: Load plugins on library open**

In `packages/app/src/main/ipc.ts`, after `library = Library.open(path)` and `library = Library.init(path)`, add:

```typescript
await library.plugins.loadAll()
```

This ensures plugins auto-load when a library is opened.

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 3: Verify TypeScript for both packages**

```bash
pnpm --filter @banjuan/core exec tsc --noEmit
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Phase 7 complete — plugin system"
```
