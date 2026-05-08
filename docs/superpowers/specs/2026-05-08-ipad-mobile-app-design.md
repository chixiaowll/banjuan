# Banjuan iPad/iOS Mobile App Design Spec

## Overview

Build an iPad/iPhone version of the Banjuan desktop knowledge management app within the existing monorepo, using Capacitor to wrap the existing React UI. Data syncs via WebDAV (file-only, no database sync). The iPad app rebuilds its local SQLite database from synced files.

## Architecture

### Package Structure

```
packages/
├── core/                  # Platform-agnostic business logic (refactored)
│   └── src/platform/      # NEW: platform abstraction interfaces
├── platform-node/         # NEW: Node.js implementations (fs, sqlite, crypto)
├── platform-capacitor/    # NEW: Capacitor implementations
├── shared-ui/             # NEW: shared React views & components
├── app/                   # Desktop Electron (existing, slimmed down)
├── mobile/                # NEW: iPad/iPhone Capacitor app
├── cli/                   # Existing
└── chrome-extension/      # Existing
```

### Three-Layer Decoupling

1. **Platform layer** (`platform-node` / `platform-capacitor`): implements fs, sqlite, crypto interfaces
2. **Business layer** (`core`): depends only on interfaces, never imports platform APIs directly
3. **UI layer** (`shared-ui`): calls business logic through an API interface, unaware of platform

## Platform Abstraction Interfaces

Defined in `packages/core/src/platform/`:

### FileSystem Interface

```typescript
export interface PlatformFS {
  readFile(path: string): Promise<Uint8Array>
  readTextFile(path: string): Promise<string>
  writeFile(path: string, data: Uint8Array): Promise<void>
  writeTextFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readdir(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  stat(path: string): Promise<{ mtime: number; size: number }>
  rename(from: string, to: string): Promise<void>
}
```

### Database Interface

```typescript
export interface PlatformDatabase {
  execute(sql: string, params?: unknown[]): void
  query<T>(sql: string, params?: unknown[]): T[]
  queryOne<T>(sql: string, params?: unknown[]): T | undefined
  close(): void
}

export interface DatabaseFactory {
  open(path: string): Promise<PlatformDatabase>
}
```

### Crypto Interface

```typescript
export interface PlatformCrypto {
  sha256(data: Uint8Array): Promise<string>
}
```

### Platform Injection

`Library` class accepts platform implementations via constructor:

```typescript
new Library(rootPath, { fs, db, crypto })
```

### Sync-to-Async Migration

All `node:fs` sync calls in core (16 files, ~40+ call sites) become async. The `platform-node` implementation wraps `readFileSync` etc. in `Promise.resolve()`, so Node.js runtime behavior is unchanged. TypeScript compiler catches any missed `await`.

The `PlatformDatabase` interface stays synchronous — both better-sqlite3 and capacitor-sqlite support sync queries.

## Platform Implementations

### platform-node

- `NodeFS`: wraps `node:fs` sync methods as async (returns `Promise.resolve`)
- `NodeDatabase`: wraps `better-sqlite3`
- `NodeCrypto`: wraps `node:crypto.createHash`

### platform-capacitor

- `CapacitorFS`: wraps `@capacitor/filesystem` (Filesystem API)
- `CapacitorDatabase`: wraps `@capacitor-community/sqlite`
- `WebCrypto`: wraps `crypto.subtle.digest`

## API Bridge Layer

### Interface Definition

`shared-ui` defines `BanjuanAPI` — a typed interface matching the shape of the current `window.electronAPI`:

```typescript
export interface BanjuanAPI {
  library: { init, open, check }
  documents: { list, get, import, delete, getFilePath, readFileBuffer, ... }
  notes: { list, get, create, update, delete, move, ... }
  annotations: { list, get, create, update, delete, ... }
  tags: { list, create, update, delete, assign, unassign, ... }
  folders: { list, create, update, delete, ... }
  mindmaps: { ... }
  graph: { getData }
  sync: { getConfig, setConfig, sync }
  dialog: { openFile, openDirectory }
  // ... other namespaces
}
```

### Desktop Implementation

Minimal change — `window.electronAPI` already matches this shape. Wrap it as a `BanjuanAPI` and provide via React Context.

### iPad Implementation

Directly instantiates `Library` from core with `platform-capacitor` implementations. No IPC overhead.

### UI Consumption

```typescript
const api = useBanjuanAPI() // React Context, platform-agnostic
await api.documents.list()
```

## Shared UI Extraction

### Moves to `packages/shared-ui/`

- `views/` — LibraryView, NoteView, DocumentViewer, GraphView, TagManagerView, TabManager
- `components/` — all reusable UI components
- `stores/` — zustand stores (mindmap, handwriting, nodeSize)
- `styles/` — CSS
- `i18n/` — internationalization

### Stays platform-specific

- `WelcomeView.tsx` — each platform has its own (Electron dialog vs Capacitor FilePicker)
- Entry files (`index.tsx`, `App.tsx`) — each platform injects its own API bridge
- Platform API bridge implementations

### Migration

All `window.electronAPI.xxx()` calls (~40+ sites) replaced with `useBanjuanAPI().xxx()`.

## Data Sync & Library Initialization (iPad)

### File-only sync via WebDAV

Database is NOT synced. Only files under `.banjuan/` are synced:
- `data/**/*.json` (document/annotation metadata)
- `notes/**/*.md` (note files)
- `tags.json`, `config.json`
- `stubs/**/*.json` (stub metadata)

### Document files (PDF/EPUB): Stub mode

Large document files (PDF, EPUB, images) are NOT synced via WebDAV. Instead:
- Only metadata (stubs) sync — existing `StubService` handles this
- Original files download on-demand when user opens a document
- Saves iPad storage; works well with limited bandwidth

### iPad initialization flow

1. User configures WebDAV connection
2. Download `.banjuan/` files from WebDAV
3. Rebuild local SQLite database from downloaded files via `IndexingService.rebuildAll()`
4. Ready to use

### Ongoing sync

1. On app open: trigger `SyncService.sync()`
2. WebDAV bidirectional file sync
3. After sync completes, incrementally update local database index for changed files
4. No file watcher needed — sync completion triggers reindex

## iPad/iPhone UI Adaptation

### Responsive Layout

- **iPad landscape**: same as desktop, sidebar always visible
- **iPad portrait / iPhone**: sidebar becomes a `Drawer`, content area fullscreen
- Controlled via `useMediaQuery` inside shared-ui components

### Touch Adaptation

- **PDF annotations**: migrate from mouse events to Pointer Events (unified mouse + touch + pen)
- **Handwriting**: already uses `perfect-freehand`, natively supports touch and Apple Pencil pressure
- **Context menus**: right-click replaced with long-press

### File Selection

- Use `@capacitor/filesystem` + iOS native file picker
- Support importing from Files app / iCloud

### Features NOT included in initial iPad release

- **Plugin system**: depends on dynamic `import()` from local filesystem; different mechanism needed on iPad. Deferred.
- **File watching** (`node:fs.watch`): replaced by post-sync reindex trigger
- **Clipboard file reading**: use Web Clipboard API subset

## Mobile Package Structure

```
packages/mobile/
├── src/
│   ├── index.tsx           # Capacitor entry point
│   ├── App.tsx             # Injects Capacitor API bridge into Context
│   ├── WelcomeView.tsx     # iPad library selection (iCloud/local)
│   └── capacitor-api.ts    # core + platform-capacitor → BanjuanAPI
├── ios/                    # Generated Xcode project
├── capacitor.config.ts
├── vite.config.ts
└── package.json
```

## Dependencies

### platform-node
- `better-sqlite3`

### platform-capacitor
- `@capacitor/core`
- `@capacitor/filesystem`
- `@capacitor-community/sqlite`
- `@capacitor/ios`

### mobile
- `@capacitor/core`
- `@capacitor/cli`
- `@banjuan/core`
- `@banjuan/platform-capacitor`
- `@banjuan/shared-ui`
- `react`, `react-dom`
- `@mantine/core`, `@mantine/hooks`
- All existing UI dependencies from app (blocknote, xyflow, pdfjs-dist, etc.)

### shared-ui
- `react`, `react-dom`
- All current renderer dependencies from app (mantine, blocknote, codemirror, xyflow, d3, framer-motion, etc.)
- `zustand`
