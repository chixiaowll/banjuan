# Sync Correctness — Plan 1: mtime Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the infinite full-resync oscillation by preserving each file's mtime end-to-end, so a synced copy carries its source's modification time and a second sync transfers nothing.

**Architecture:** Add an optional, best-effort `PlatformFS.setMtime`. On download, `SyncService` sets the local file's mtime to the remote's (guarded on `>0`). On upload, the client passes the local mtime, the WebDAV adapters send it as a custom `X-Banjuan-Mtime` header, and our LAN host applies it after writing. Real WebDAV servers ignore the header; the existing ±1000ms compare-grace absorbs the LAN host's second-precision listing so mtimes converge.

**Tech Stack:** TypeScript, Node `fs.utimesSync`, existing `SyncService` / `WebDAVAdapter` / `WebDAVFetchAdapter` / `lan-host-handler`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-sync-correctness-design.md` (Block 1). Deletion-propagation correctness, double-edit conflict detection, conflict copies, and tags union (Blocks 2–4) are a **separate follow-on plan** — not in scope here.

---

## File Structure

**Create:**
- `packages/platform-node/src/fs.test.ts` — unit test for `NodeFS.setMtime`.

**Modify:**
- `packages/core/src/platform/fs.ts` — add optional `setMtime?` to the `PlatformFS` interface.
- `packages/platform-node/src/fs.ts` — implement `setMtime`.
- `packages/core/src/sync/adapter.ts` — add optional `mtimeMs` to `SyncAdapter.upload`.
- `packages/core/src/sync/webdav-adapter.ts` — send `X-Banjuan-Mtime` header on PUT when given.
- `packages/core/src/sync/webdav-fetch-adapter.ts` — same for the fetch adapter.
- `packages/core/src/sync/lan-host-handler.ts` — honor `X-Banjuan-Mtime` on PUT; add a handler test case.
- `packages/core/src/sync/lan-host-handler.test.ts` — test PUT-with-mtime.
- `packages/core/src/sync/service.ts` — preserve mtime on download; pass mtime on upload.
- `packages/core/src/sync/lan-sync.integration.test.ts` — add "sync twice → 0/0" convergence tests.

---

## Task 1: `PlatformFS.setMtime` (optional) + NodeFS implementation

**Files:**
- Modify: `packages/core/src/platform/fs.ts`
- Modify: `packages/platform-node/src/fs.ts`
- Test: `packages/platform-node/src/fs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/platform-node/src/fs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from './fs.js'

describe('NodeFS.setMtime', () => {
  it('sets a file mtime to the given epoch-ms value', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nodefs-'))
    const f = join(dir, 'a.txt')
    writeFileSync(f, 'hi')
    const fs = new NodeFS()
    const target = 1_700_000_000_000  // 2023-11-14T...
    await fs.setMtime(f, target)
    // Filesystems may round to the nearest second; allow ±1s.
    expect(Math.abs(statSync(f).mtimeMs - target)).toBeLessThanOrEqual(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/platform-node exec vitest run src/fs.test.ts`
Expected: FAIL — `fs.setMtime is not a function`.

- [ ] **Step 3: Add the optional method to the interface**

In `packages/core/src/platform/fs.ts`, add this line inside the `PlatformFS` interface, immediately after the `stat(...)` line:

```typescript
  setMtime?(path: string, mtimeMs: number): Promise<void>
```

(It is optional — like the existing `watch?` — so platforms that can't set mtime, e.g. capacitor, need no change.)

- [ ] **Step 4: Implement in NodeFS**

In `packages/platform-node/src/fs.ts`, add this method to the `NodeFS` class (e.g. right after the `stat` method):

```typescript
  async setMtime(filePath: string, mtimeMs: number): Promise<void> {
    const t = new Date(mtimeMs)
    fs.utimesSync(filePath, t, t)
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @banjuan/platform-node exec vitest run src/fs.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck core**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/platform/fs.ts packages/platform-node/src/fs.ts packages/platform-node/src/fs.test.ts
git commit -m "feat(platform): add optional PlatformFS.setMtime (NodeFS via fs.utimes)"
```

---

## Task 2: `SyncAdapter.upload` accepts optional mtime; adapters send `X-Banjuan-Mtime`

**Files:**
- Modify: `packages/core/src/sync/adapter.ts`
- Modify: `packages/core/src/sync/webdav-adapter.ts`
- Modify: `packages/core/src/sync/webdav-fetch-adapter.ts`

- [ ] **Step 1: Extend the adapter interface**

In `packages/core/src/sync/adapter.ts`, change the `upload` signature:

```typescript
  upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void>
```

(The new param is optional, so existing callers — including `StubService.uploadFile`, which calls `this.adapter.upload(localPath, '/' + remotePath)` — keep compiling unchanged.)

- [ ] **Step 2: Send the header from WebDAVAdapter (Node)**

In `packages/core/src/sync/webdav-adapter.ts`, replace the `upload` method:

```typescript
  async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void> {
    const client = this.getClient()
    const content = await this.fs.readFile(localPath)
    const options = mtimeMs && mtimeMs > 0
      ? { headers: { 'X-Banjuan-Mtime': String(mtimeMs) } }
      : undefined
    await client.putFileContents(remotePath, Buffer.from(content), options)
  }
```

(`PutFileContentsOptions` extends `WebDAVMethodOptions`, which has `headers?` — so this type-checks against the `webdav` package.)

- [ ] **Step 3: Send the header from WebDAVFetchAdapter (browser/capacitor)**

In `packages/core/src/sync/webdav-fetch-adapter.ts`, replace the `upload` method:

```typescript
  async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void> {
    const t0 = performance.now()
    const content = await this.fs.readFile(localPath)
    const headers: Record<string, string> = { ...this.headers }
    if (mtimeMs && mtimeMs > 0) headers['X-Banjuan-Mtime'] = String(mtimeMs)
    const resp = await fetch(this.url(remotePath), {
      method: 'PUT',
      headers,
      body: content.buffer as ArrayBuffer,
    })
    if (!resp.ok) throw new Error(`PUT ${remotePath}: ${resp.status} ${resp.statusText}`)
    console.log(`[sync] PUT ${remotePath} (${content.length}B) took ${(performance.now() - t0).toFixed(0)}ms`)
  }
```

- [ ] **Step 4: Typecheck core**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS (no errors about `upload` arity at call sites).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/adapter.ts packages/core/src/sync/webdav-adapter.ts packages/core/src/sync/webdav-fetch-adapter.ts
git commit -m "feat(sync): adapters send optional X-Banjuan-Mtime header on upload"
```

---

## Task 3: LAN host honors `X-Banjuan-Mtime` on PUT

**Files:**
- Modify: `packages/core/src/sync/lan-host-handler.ts`
- Test: `packages/core/src/sync/lan-host-handler.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/sync/lan-host-handler.test.ts`, add this test inside the existing `describe('lan-host-handler', ...)` block (the file already has `import { statSync } ...`? if not, add `statSync` to the existing `node:fs` import — the file imports `mkdtempSync, writeFileSync, mkdirSync` from `'node:fs'`; add `statSync`). Use the existing `root`, `ctx`, and `basic()` helpers:

```typescript
  it('PUT applies X-Banjuan-Mtime to the written file', async () => {
    const auth = basic('secrettoken')
    const target = 1_700_000_000_000
    const res = await handleDavRequest(
      { method: 'PUT', path: '/timed.md', headers: { authorization: auth, 'x-banjuan-mtime': String(target) }, body: new TextEncoder().encode('hi') }, ctx)
    expect(res.status).toBe(201)
    const { statSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(Math.abs(statSync(join(root, 'timed.md')).mtimeMs - target)).toBeLessThanOrEqual(1000)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: FAIL — the written file's mtime is "now", not `target` (diff far exceeds 1000ms).

- [ ] **Step 3: Honor the header in the PUT branch**

In `packages/core/src/sync/lan-host-handler.ts`, replace the `PUT` case body:

```typescript
    case 'PUT': {
      // Deliberate RFC 4918 deviation: create missing parents (recursive) for sync robustness.
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, req.body ?? new Uint8Array())
      // Preserve the client's mtime when provided, so the next sync sees the files
      // as identical instead of re-transferring them. Best-effort.
      const rawMtime = req.headers['x-banjuan-mtime']
      const mtimeMs = rawMtime ? Number(rawMtime) : 0
      if (mtimeMs > 0) {
        try { await fs.setMtime?.(abs, mtimeMs) } catch { /* best-effort */ }
      }
      return { status: 201, headers: {} }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: PASS (9 tests — the 8 existing plus the new one).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/lan-host-handler.ts packages/core/src/sync/lan-host-handler.test.ts
git commit -m "feat(sync): LAN host applies X-Banjuan-Mtime to PUT files"
```

---

## Task 4: `SyncService` preserves mtime on download, passes it on upload

**Files:**
- Modify: `packages/core/src/sync/service.ts`

- [ ] **Step 1: Add a best-effort preserve helper**

In `packages/core/src/sync/service.ts`, add this private method to the `SyncService` class (e.g. right after `toRemotePath`):

```typescript
  // Make the local copy carry the source file's mtime so the next sync treats
  // them as identical (within the ±1000ms compare grace) instead of re-transferring.
  // Best-effort: skipped when the platform lacks setMtime or the source mtime is unknown.
  private async preserveMtime(localPath: string, mtime: number): Promise<void> {
    if (mtime > 0) {
      try { await this.fs.setMtime?.(localPath, mtime) } catch { /* best-effort */ }
    }
  }
```

- [ ] **Step 2: Preserve mtime after the two download branches**

In `sync()`, the "both exist, remote newer" branch currently reads:

```typescript
          if (remote.mtime > local.mtime + 1000) {
            await this.adapter.download(this.toRemotePath(path), local.absolutePath)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          } else if (local.mtime > remote.mtime + 1000) {
```

Replace it with (adds the `preserveMtime` call, and passes the upload mtime in the same branch):

```typescript
          if (remote.mtime > local.mtime + 1000) {
            await this.adapter.download(this.toRemotePath(path), local.absolutePath)
            await this.preserveMtime(local.absolutePath, remote.mtime)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          } else if (local.mtime > remote.mtime + 1000) {
```

And the "remote only" download branch currently reads:

```typescript
          } else {
            const localPath = join(this.rootPath, path)
            await this.fs.mkdir(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          }
```

Replace it with:

```typescript
          } else {
            const localPath = join(this.rootPath, path)
            await this.fs.mkdir(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            await this.preserveMtime(localPath, remote.mtime)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          }
```

- [ ] **Step 3: Pass the local mtime on the two upload branches**

The "both exist, local newer" upload currently reads:

```typescript
          } else if (local.mtime > remote.mtime + 1000) {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
```

Replace it with:

```typescript
          } else if (local.mtime > remote.mtime + 1000) {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path), local.mtime)
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
```

The "local only, new" upload currently reads:

```typescript
          } else {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
```

Replace it with:

```typescript
          } else {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path), local.mtime)
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
```

- [ ] **Step 4: Typecheck core**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run the full sync suite (no regressions)**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/`
Expected: all existing sync tests still PASS (15 from before).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/service.ts
git commit -m "feat(sync): preserve mtime on download and pass it on upload"
```

---

## Task 5: Convergence integration tests ("sync twice → 0/0")

This is the proof the oscillation is gone: a second sync immediately after the first must transfer nothing.

**Files:**
- Modify: `packages/core/src/sync/lan-sync.integration.test.ts`

- [ ] **Step 1: Add the convergence tests**

In `packages/core/src/sync/lan-sync.integration.test.ts`, add these two tests inside the existing `describe('LAN sync integration ...')` block. They reuse the existing `hostRoot`, `clientRoot`, `port`, and `TOKEN` set up in `beforeEach`. Add a small local helper at the top of the new tests to build a connected adapter (or inline it as the existing tests do):

```typescript
  it('host -> client converges: second sync transfers nothing', async () => {
    writeFileSync(join(hostRoot, 'paper.pdf'), 'HOSTDATA')
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    }
    const first = await (await connect()).sync()
    expect(first.downloaded).toBeGreaterThanOrEqual(1)
    expect(first.errors).toEqual([])

    const second = await (await connect()).sync()
    expect(second.downloaded).toBe(0)
    expect(second.uploaded).toBe(0)
    expect(second.errors).toEqual([])
  })

  it('client -> host converges: second sync transfers nothing', async () => {
    writeFileSync(join(clientRoot, 'mynote.md'), 'CLIENTNOTE')
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    }
    const first = await (await connect()).sync()
    expect(first.uploaded).toBeGreaterThanOrEqual(1)
    expect(first.errors).toEqual([])

    const second = await (await connect()).sync()
    expect(second.uploaded).toBe(0)
    expect(second.downloaded).toBe(0)
    expect(second.errors).toEqual([])
  })
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-sync.integration.test.ts`
Expected: PASS (5 tests — 3 existing + 2 new). The two new ones prove convergence: without the mtime fix the second sync would re-transfer (downloaded/uploaded ≥ 1), so these tests fail on the pre-fix code and pass after Tasks 1–4.

- [ ] **Step 3: Run the full sync suite**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/`
Expected: all PASS (was 15; now 17 — +1 handler test from Task 3, +2 integration tests here; the NodeFS test lives in the platform-node package).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/sync/lan-sync.integration.test.ts
git commit -m "test(sync): prove mtime preservation converges (second sync is 0/0)"
```

---

## Self-Review (completed during planning)

**Spec coverage (Block 1):**
- Filesystem-level mtime, no sidecar → Task 1 (`setMtime` sets the file's own mtime). ✓
- `setMtime` optional + best-effort (mobile unaffected, never crashes) → Task 1 (optional interface) + Tasks 3/4 (`?.` + try/catch). ✓
- Download preserves mtime, guarded on `>0` → Task 4. ✓
- Upload sends mtime via custom header; LAN host honors it; real WebDAV ignores it → Tasks 2 + 3. ✓
- Converges via existing ±1000ms grace (no compare-logic change) → verified by Task 5 (second sync 0/0 despite the LAN host's second-precision PROPFIND). ✓

**Out of scope (follow-on plan), intentionally not covered here:** snapshot baseline upgrade to `{path: mtime}`, double-edit conflict detection, delete-vs-edit handling, conflict copies, tags union, sync summary. These are Blocks 2–4 of the spec.

**Type consistency:** `setMtime(path: string, mtimeMs: number)` is used identically in the interface (Task 1), NodeFS (Task 1), handler (Task 3 via `fs.setMtime?.`), and SyncService (Task 4 via `this.fs.setMtime?.`). `upload(localPath, remotePath, mtimeMs?)` is consistent across the interface (Task 2), both adapters (Task 2), and both SyncService call sites (Task 4). Header name `X-Banjuan-Mtime` (sent) ↔ `x-banjuan-mtime` (read, lowercased per the handler's lowercased-headers contract) match.

**Placeholder scan:** none — every step has concrete code and exact commands.
