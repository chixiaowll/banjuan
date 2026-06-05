# Sync Pairing Safety — Plan 1: Book-room Identity + Connect Guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every library a stable identity and refuse to silently merge two *different* book-rooms over LAN — sync only proceeds when the two ends are the same room, an empty client adopting the host's identity, or the user explicitly confirms a cross-room merge.

**Architecture:** Add a stable `id` to `LibraryConfig` (derived from path + creation time). Exclude `.banjuan/config.json` from sync so identity is never overwritten by a peer. The LAN host advertises `{libraryId, libraryName}` in its pairing response; the client compares it to its own library id before syncing and decides: match → sync, empty client → adopt, non-empty mismatch → return `needsConfirm` (the UI gets explicit confirmation, then retries with `force`).

**Tech Stack:** TypeScript, existing `Library` / `SyncService` / `lan-host-handler` / `LanHostServer`, Electron IPC + preload, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-sync-pairing-safety-design.md` (identity + connect-guard portions).

**Scope — NOT in this plan (becomes Plan 2):** device identity (`device.json`), persistent paired-devices store, durable tokens / PIN-free reconnect, the `/.banjuan-info` endpoint, and the link/unlink ("已连接设备" list + delete) UI. Plan 1 keeps the existing per-session PIN + token auth; it only adds *identity* and the *same-room guard*. After Plan 1, connecting two different non-empty rooms is blocked unless confirmed — the core safety the user asked for.

---

## File Structure

**Modify:**
- `packages/core/src/types.ts` — add `id` to `LibraryConfig`.
- `packages/core/src/library.ts` — generate `id` at `init`, back-fill at `open`; add `getId()` and `adoptLibraryId()`.
- `packages/core/src/library.test.ts` (create if absent) — id generation/back-fill tests.
- `packages/core/src/sync/service.ts` — exclude `.banjuan/config.json` from sync via a path-set.
- `packages/core/src/sync/lan-sync.integration.test.ts` — assert config.json is not transferred.
- `packages/core/src/sync/lan-host-handler.ts` — `DavContext` gains `libraryId`/`libraryName`; pairing response includes them.
- `packages/core/src/sync/lan-host-handler.test.ts` — assert pairing response carries identity.
- `packages/app/src/main/lan-host-server.ts` — read `config.json` and populate `libraryId`/`libraryName` into `DavContext`.
- `packages/app/src/main/ipc.ts` — `lan:connectAndSync` gains the identity guard + `force` arg.
- `packages/app/src/preload/index.ts` — `lan.connectAndSync` passes `force`.
- `packages/shared-ui/src/api.ts` — `connectAndSync` type: `force?` + union return.
- `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx` — handle `needsConfirm` with a confirm dialog + retry.

---

## Task 1: Library identity `id` (generate, back-fill, accessors)

**Files:**
- Modify: `packages/core/src/types.ts` (the `LibraryConfig` interface)
- Modify: `packages/core/src/library.ts`
- Test: `packages/core/src/library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/library.test.ts` (if a `library.test.ts` already exists, append the `describe` block instead):

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { Library } from './library.js'

function deps() {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), globalPluginsDir: join(tmpdir(), 'gp') }
}

describe('Library identity', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'lib-id-')) + '/lib' })

  it('init writes a 32-char hex id into config.json', async () => {
    const lib = await Library.init(root, deps() as any, 'Test')
    const id = await lib.getId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    const cfg = JSON.parse(readFileSync(join(root, '.banjuan', 'config.json'), 'utf-8'))
    expect(cfg.id).toBe(id)
  })

  it('open back-fills id for a legacy library that lacks one', async () => {
    // Simulate a pre-identity library: config.json with no id field.
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    writeFileSync(join(root, '.banjuan', 'config.json'),
      JSON.stringify({ name: 'Legacy', version: '1', createdAt: '2026-01-01T00:00:00.000Z' }))
    const lib = await Library.open(root, deps() as any)
    const id = await lib.getId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    // persisted, and stable across reopen
    const cfg = JSON.parse(readFileSync(join(root, '.banjuan', 'config.json'), 'utf-8'))
    expect(cfg.id).toBe(id)
    const lib2 = await Library.open(root, deps() as any)
    expect(await lib2.getId()).toBe(id)
  })

  it('adoptLibraryId overwrites the id', async () => {
    const lib = await Library.init(root, deps() as any, 'Test')
    await lib.adoptLibraryId('ffffffffffffffffffffffffffffffff')
    expect(await lib.getId()).toBe('ffffffffffffffffffffffffffffffff')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/platform-node build && pnpm --filter @banjuan/core exec vitest run src/library.test.ts`
Expected: FAIL — `getId`/`adoptLibraryId` not defined, and `config.id` undefined.

- [ ] **Step 3: Add `id` to the type**

In `packages/core/src/types.ts`, change the `LibraryConfig` interface to:

```typescript
export interface LibraryConfig {
  id: string
  name: string
  version: string
  createdAt: string
}
```

- [ ] **Step 4: Generate id at init, back-fill at open, add accessors**

In `packages/core/src/library.ts`:

(a) In `static async init`, the config is currently built as:
```typescript
    const config: LibraryConfig = {
      name: name || 'My Library',
      version: '1',
      createdAt: new Date().toISOString(),
    }
    await deps.fs.writeTextFile(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))
```
Replace with (compute a stable id from rootPath + createdAt):
```typescript
    const createdAt = new Date().toISOString()
    const id = (await deps.crypto.sha256(new TextEncoder().encode(rootPath + '|' + createdAt))).slice(0, 32)
    const config: LibraryConfig = {
      id,
      name: name || 'My Library',
      version: '1',
      createdAt,
    }
    await deps.fs.writeTextFile(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))
```

(b) In `static async open`, just before the final `return new Library(rootPath, db, deps)`, add the back-fill:
```typescript
    // Back-fill identity for libraries created before `id` existed (idempotent).
    const cfgPath = join(banjuanDir, 'config.json')
    try {
      const cfg = JSON.parse(await deps.fs.readTextFile(cfgPath))
      if (!cfg.id) {
        cfg.id = (await deps.crypto.sha256(new TextEncoder().encode(rootPath + '|' + (cfg.createdAt ?? '')))).slice(0, 32)
        await deps.fs.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2))
      }
    } catch { /* config unreadable — leave as-is */ }
```

(c) Add two methods next to the existing `getName`/`setName`:
```typescript
  async getId(): Promise<string> {
    const config = await this.getConfig()
    return config.id
  }

  async adoptLibraryId(id: string): Promise<void> {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    const config = await this.getConfig()
    config.id = id
    await this.fs.writeTextFile(configPath, JSON.stringify(config, null, 2))
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/library.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck core**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS. (If other code constructs a `LibraryConfig` literal without `id`, fix it; a grep `LibraryConfig` shows only library.ts builds one.)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/library.ts packages/core/src/library.test.ts
git commit -m "feat(core): add stable library id (init generate, open back-fill, adopt)"
```

---

## Task 2: Exclude `.banjuan/config.json` from sync

So a peer's `config.json` (its identity + name) never overwrites the local one.

**Files:**
- Modify: `packages/core/src/sync/service.ts`
- Test: `packages/core/src/sync/lan-sync.integration.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/sync/lan-sync.integration.test.ts`, add this test inside the existing `describe('LAN sync integration ...')` block (it has `hostRoot`, `clientRoot`, `port`, `TOKEN`, and imports `writeFileSync`, `readFileSync`, `existsSync`, `join`):

```typescript
  it('does not sync .banjuan/config.json (identity stays local)', async () => {
    writeFileSync(join(hostRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'HOSTID', name: 'HostRoom', version: '1', createdAt: 'x' }))
    writeFileSync(join(clientRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'CLIENTID', name: 'ClientRoom', version: '1', createdAt: 'y' }))
    const a = new WebDAVAdapter(new NodeFS())
    await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    await svc.sync()
    // client config untouched by the host's
    const clientCfg = JSON.parse(readFileSync(join(clientRoot, '.banjuan', 'config.json'), 'utf-8'))
    expect(clientCfg.id).toBe('CLIENTID')
    // host config untouched by the client's
    const hostCfg = JSON.parse(readFileSync(join(hostRoot, '.banjuan', 'config.json'), 'utf-8'))
    expect(hostCfg.id).toBe('HOSTID')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-sync.integration.test.ts`
Expected: FAIL — config.json currently syncs, so one side's id overwrites the other.

- [ ] **Step 3: Add a path-based exclusion to SyncService**

In `packages/core/src/sync/service.ts`, add a module-level constant near the top (after the imports):

```typescript
// Files excluded from sync by their FULL relative path (not basename) — these
// hold per-device identity/settings that must never be overwritten by a peer.
const SYNC_EXCLUDED_PATHS = new Set([
  '.banjuan/config.json',
])
```

In `collectLocalFiles`, the loop pushes `{ relativePath: rel, ... }`. Guard it — change the callback body so excluded paths are skipped:

```typescript
  private async collectLocalFiles(): Promise<Array<{ relativePath: string; absolutePath: string; mtime: number }>> {
    const results: Array<{ relativePath: string; absolutePath: string; mtime: number }> = []
    await this.walkDir(this.rootPath, async (absPath) => {
      try {
        const rel = relative(this.rootPath, absPath)
        if (SYNC_EXCLUDED_PATHS.has(rel)) return
        const stat = await this.fs.stat(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtime })
      } catch {
        // skip files that can't be stat'd
      }
    })
    return results
  }
```

In `collectRemoteFiles`, after computing `rel`, skip excluded paths. The loop currently ends with `if (rel) results.push({ relativePath: rel, mtime: item.mtime, size: item.size })`. Change to:

```typescript
        if (rel && !SYNC_EXCLUDED_PATHS.has(rel)) results.push({ relativePath: rel, mtime: item.mtime, size: item.size })
```

(Excluding from both the local and remote sets means config.json is never uploaded, downloaded, or deletion-tracked.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-sync.integration.test.ts`
Expected: PASS (existing tests + this new one).

- [ ] **Step 5: Run the full sync suite**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/service.ts packages/core/src/sync/lan-sync.integration.test.ts
git commit -m "feat(sync): exclude .banjuan/config.json from sync (keep identity per-device)"
```

---

## Task 3: LAN host advertises its identity in the pairing response

**Files:**
- Modify: `packages/core/src/sync/lan-host-handler.ts`
- Test: `packages/core/src/sync/lan-host-handler.test.ts`
- Modify: `packages/app/src/main/lan-host-server.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/sync/lan-host-handler.test.ts`, the `beforeEach` builds `ctx = { rootPath: root, fs: new NodeFS(), token: 'secrettoken', pin: '123456' }`. Add `libraryId`/`libraryName` to it by editing that line to:

```typescript
    ctx = { rootPath: root, fs: new NodeFS(), token: 'secrettoken', pin: '123456', libraryId: 'LIB123', libraryName: 'My Room' }
```

Then add this test inside the describe block:

```typescript
  it('pairing response includes the host library identity', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456' } }, ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.token).toBe('secrettoken')
    expect(body.libraryId).toBe('LIB123')
    expect(body.libraryName).toBe('My Room')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: FAIL — response body has no `libraryId`/`libraryName` (and TS error on the unknown `ctx` fields).

- [ ] **Step 3: Extend DavContext and the pairing response**

In `packages/core/src/sync/lan-host-handler.ts`, add the two optional fields to `DavContext`:

```typescript
export interface DavContext {
  rootPath: string
  fs: PlatformFS
  token: string
  pin: string
  pairPath?: string                     // default '/.banjuan-pair'
  libraryId?: string
  libraryName?: string
}
```

And in the pairing endpoint, change the success response body:

```typescript
  if (method === 'GET' && req.path === pairPath) {
    const pin = req.query?.pin ?? ''
    if (pin === ctx.pin) {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ctx.token, libraryId: ctx.libraryId ?? '', libraryName: ctx.libraryName ?? '' }) }
    }
    return { status: 403, headers: {}, body: 'Bad PIN' }
  }
```

- [ ] **Step 4: Populate identity in LanHostServer**

In `packages/app/src/main/lan-host-server.ts`, add `import { join } from 'node:path'` to the imports. In `start()`, where it builds `const ctx: DavContext = { rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin }`, replace with a version that reads the library config first:

```typescript
    let libraryId = ''
    let libraryName = ''
    try {
      const cfg = JSON.parse(await this.fs.readTextFile(join(this.rootPath, '.banjuan', 'config.json')))
      libraryId = cfg.id ?? ''
      libraryName = cfg.name ?? ''
    } catch { /* config unreadable — advertise empty identity */ }

    const ctx: DavContext = { rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin, libraryId, libraryName }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: PASS (existing handler tests + the new one).
Run: `pnpm --filter @banjuan/core exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: core clean; app only pre-existing errors (none referencing lan-host-server.ts).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/lan-host-handler.ts packages/core/src/sync/lan-host-handler.test.ts packages/app/src/main/lan-host-server.ts
git commit -m "feat(sync): LAN host advertises {libraryId, libraryName} in pairing response"
```

---

## Task 4: Identity guard in `lan:connectAndSync` (+ `force`)

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Replace the `lan:connectAndSync` handler**

In `packages/app/src/main/ipc.ts`, replace the entire current `ipcMain.handle('lan:connectAndSync', ...)` handler with:

```typescript
  // Client side: pair (PIN -> token + host identity), guard against merging a
  // DIFFERENT book-room, then run a full bidirectional sync.
  ipcMain.handle('lan:connectAndSync', async (event, peerUrl: string, pin: string, force?: boolean) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('PAIR_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')

    // 1) Pair: GET {base}/.banjuan-pair?pin=NNNNNN -> { token, libraryId, libraryName }
    const pairResp = await fetch(`${base}/.banjuan-pair?pin=${encodeURIComponent(pin)}`)
    if (!pairResp.ok) throw new Error(`PAIR_FAILED:${pairResp.status}`)
    const { token, libraryId: hostLibraryId, libraryName: hostLibraryName } =
      await pairResp.json() as { token: string; libraryId?: string; libraryName?: string }
    if (!token) throw new Error('PAIR_FAILED:no-token')

    // 2) Book-room identity guard.
    const localId = await library.getId()
    if (hostLibraryId && hostLibraryId !== localId) {
      const isEmpty = (await library.documents.list()).length === 0
      if (isEmpty || force) {
        // New device joining this room (empty), or the user explicitly confirmed
        // a cross-room merge — adopt the host's identity so future syncs match.
        await library.adoptLibraryId(hostLibraryId)
      } else {
        // Different, non-empty room — refuse until the user confirms.
        return { needsConfirm: true as const, peerName: hostLibraryName ?? '', localName: await library.getName() }
      }
    }

    // 3) Reuse existing WebDAVAdapter unchanged: Basic auth, password = token.
    const { SyncService, WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect({ type: 'webdav', url: base, username: 'banjuan', password: token, remotePath: '/' })
    const svc = new SyncService(library.rootPath, adapter, library.events, deps.fs, '/')
    try {
      const result = await svc.sync((p) => { event.sender.send('sync:progress', p) })
      event.sender.send('sync:progress', { phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
      const indexService = library.createIndexService()
      await indexService.rebuildFull()
      return result
    } finally {
      await adapter.disconnect()
    }
  })
```

- [ ] **Step 2: Typecheck app**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors; nothing referencing `connectAndSync`, `getId`, `adoptLibraryId`, or `documents.list`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(sync): guard connectAndSync against merging a different book-room"
```

---

## Task 5: Preload + API types for `force` and the `needsConfirm` return

**Files:**
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/shared-ui/src/api.ts`

- [ ] **Step 1: Pass `force` through preload**

In `packages/app/src/preload/index.ts`, the current `lan.connectAndSync` is:

```typescript
    connectAndSync: (peerUrl: string, pin: string, onProgress?: (p: any) => void) => {
      const handler = onProgress ? (_e: any, p: any) => onProgress(p) : null
      if (handler) ipcRenderer.on('sync:progress', handler)
      return ipcRenderer.invoke('lan:connectAndSync', peerUrl, pin).finally(() => {
        if (handler) ipcRenderer.removeListener('sync:progress', handler)
      })
    },
```

Replace with (append a `force` param, forwarded to invoke):

```typescript
    connectAndSync: (peerUrl: string, pin: string, onProgress?: (p: any) => void, force?: boolean) => {
      const handler = onProgress ? (_e: any, p: any) => onProgress(p) : null
      if (handler) ipcRenderer.on('sync:progress', handler)
      return ipcRenderer.invoke('lan:connectAndSync', peerUrl, pin, force).finally(() => {
        if (handler) ipcRenderer.removeListener('sync:progress', handler)
      })
    },
```

- [ ] **Step 2: Update the API type**

In `packages/shared-ui/src/api.ts`, the `lan.connectAndSync` member currently returns `Promise<{ uploaded; downloaded; deletedLocal; deletedRemote; stubbed; errors }>`. Replace that member with:

```typescript
    connectAndSync(
      peerUrl: string,
      pin: string,
      onProgress?: (p: { phase: string; current: number; total: number; currentFile: string }) => void,
      force?: boolean,
    ): Promise<
      | { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; stubbed: number; errors: string[] }
      | { needsConfirm: true; peerName: string; localName: string }
    >
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: shared-ui clean; app only pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/preload/index.ts packages/shared-ui/src/api.ts
git commit -m "feat(sync): thread force + needsConfirm through preload/api types"
```

---

## Task 6: UI — confirm before merging a different book-room

**Files:**
- Modify: `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`

- [ ] **Step 1: Update `connectPeer` to handle `needsConfirm`**

In `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`, the current `connectPeer` is:

```typescript
  const connectPeer = async () => {
    if (!peerUrl || !/^\d{6}$/.test(peerPin)) { setLanMsg('请输入对方地址和 6 位 PIN'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    try {
      const r = await api.lan.connectAndSync(peerUrl, peerPin, (p) => setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`))
      setLanMsg(`完成:↓${r.downloaded} ↑${r.uploaded} 删除 ${r.deletedLocal + r.deletedRemote}${r.errors.length ? `,错误 ${r.errors.length}` : ''}`)
    } catch (e: any) {
      setLanMsg(`失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }
```

Replace it with (handles the `needsConfirm` branch, retries with `force`, and a shared result renderer):

```typescript
  const showSyncResult = (r: { downloaded: number; uploaded: number; deletedLocal: number; deletedRemote: number; errors: string[] }) => {
    setLanMsg(`完成:↓${r.downloaded} ↑${r.uploaded} 删除 ${r.deletedLocal + r.deletedRemote}${r.errors.length ? `,错误 ${r.errors.length}` : ''}`)
  }

  const connectPeer = async () => {
    if (!peerUrl || !/^\d{6}$/.test(peerPin)) { setLanMsg('请输入对方地址和 6 位 PIN'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    const onProgress = (p: { phase: string; current: number; total: number; currentFile: string }) =>
      setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`)
    try {
      const r = await api.lan.connectAndSync(peerUrl, peerPin, onProgress)
      if ('needsConfirm' in r) {
        const ok = confirm(`对方是不同的书房「${r.peerName}」,当前是「${r.localName}」。继续会把两个书房合并,通常你不想这样。确定继续吗?`)
        if (!ok) { setLanMsg('已取消'); return }
        setLanMsg('合并中…')
        const r2 = await api.lan.connectAndSync(peerUrl, peerPin, onProgress, true)
        if ('needsConfirm' in r2) { setLanMsg('已取消'); return }
        showSyncResult(r2)
        return
      }
      showSyncResult(r)
    } catch (e: any) {
      setLanMsg(`失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }
```

- [ ] **Step 2: Typecheck shared-ui**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: PASS (the union return type narrows correctly via `'needsConfirm' in r`).

- [ ] **Step 3: Manual verification (two windows, after rebuilding core)**

1. `pnpm --filter @banjuan/core build && pnpm --filter @banjuan/platform-node build`, restart `pnpm dev`.
2. Window A opens book-room A (non-empty), 开启共享 → note URL + PIN.
3. Window B opens a DIFFERENT non-empty book-room B → connect to A with PIN.
4. Expect the confirm dialog ("对方是不同的书房「A」…"). Cancel → "已取消", nothing synced.
5. Re-connect, confirm → it merges (and B adopts A's id; a subsequent connect won't warn).
6. With an EMPTY book-room B → connect to A → no warning, syncs and adopts A's id.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ui/src/components/sync/SyncConfigPanel.tsx
git commit -m "feat(sync): confirm before merging a different book-room over LAN"
```

---

## Self-Review (completed during planning)

**Spec coverage (Plan 1 portion):**
- Library `id` (init generate / open back-fill) → Task 1. ✓
- `config.json` excluded from sync (identity not overwritten) → Task 2. ✓
- Host advertises `{libraryId, libraryName}` → Task 3. ✓
- Connect guard: match → sync; empty → adopt; non-empty mismatch → needsConfirm → force → adopt+merge → Tasks 4–6. ✓
- UI strong confirm (方案 B) → Task 6. ✓
- **Deferred to Plan 2 (explicitly out of scope):** device.json, paired-devices store, durable token / PIN-free reconnect, `/.banjuan-info`, link/unlink/delete UI. Stated at top.

**Type consistency:** `getId()`/`adoptLibraryId(id)` defined in Task 1, used in Task 4. `LibraryConfig.id` (Task 1) read in Task 3's LanHostServer and the back-fill. `DavContext.libraryId/libraryName` (Task 3) populated by LanHostServer (Task 3) and consumed from the pair response in Task 4. `connectAndSync(peerUrl, pin, onProgress?, force?)` consistent across ipc (Task 4: `(event, peerUrl, pin, force)`), preload (Task 5), api (Task 5), UI (Task 6). The `needsConfirm` shape `{ needsConfirm: true; peerName; localName }` matches across Task 4 (returned), Task 5 (typed), Task 6 (`'needsConfirm' in r`).

**Placeholder scan:** none — every step has concrete code and exact commands.

**Build note:** core and platform-node resolve via `dist/`, so the manual verification step rebuilds them before `pnpm dev`. (The recurring "rebuild core dist" gotcha.)
