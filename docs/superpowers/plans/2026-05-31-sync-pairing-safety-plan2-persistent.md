# Sync Pairing Safety — Plan 2: Persistent Device Pairing (link / reconnect / delete)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link two devices once with a PIN, then reconnect without a PIN via a stored durable token, and let the user see and delete paired devices.

**Architecture:** Each install gets a stable `deviceId` (`~/.banjuan/device.json`). Each library keeps a device-local, never-synced `paired-devices.json` (peer deviceId + name + libraryId + a shared durable token). The host gains a no-auth `/.banjuan-info` endpoint (identity discovery) and accepts any stored token (not just the per-session one); the PIN endpoint now records the peer and mints/returns a durable token. The client, on connect, asks `/.banjuan-info`: if the peer is already paired it uses the stored token (no PIN); otherwise it returns `needsPin` so the UI prompts once. Link/unlink are exposed as `lan.listPairedDevices` / `lan.unpairDevice` with a "已连接设备" UI.

**Tech Stack:** TypeScript, existing `lan-host-handler` / `LanHostServer` / `SyncService` / Electron IPC + preload / React, Node `crypto.randomUUID`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-sync-pairing-safety-design.md` (persistent-pairing portions). Builds on Plan 1 (book-room identity + connect guard), which is already merged on this branch.

**Out of scope (later):** mDNS auto-discovery of the peer URL (still manual IP:port), TLS, multi-device topology UI beyond a flat list.

---

## File Structure

**Create:**
- `packages/core/src/sync/pairing-store.ts` — read/write `.banjuan/paired-devices.json`; list/find/has-token/add/remove.
- `packages/core/src/sync/pairing-store.test.ts` — unit tests.
- `packages/app/src/main/device-identity.ts` — read/create `~/.banjuan/device.json`.

**Modify:**
- `packages/core/src/sync/service.ts` — add `.banjuan/paired-devices.json` to `SYNC_EXCLUDED_PATHS`.
- `packages/core/src/sync/lan-host-handler.ts` — `/.banjuan-info` route; `DavContext` gains `deviceId/deviceName/infoPath/isValidToken?/recordPairing?`; PIN endpoint records peer + mints token; auth accepts stored tokens; host blocks `paired-devices.json`.
- `packages/core/src/sync/lan-host-handler.test.ts` — info endpoint + persistent-token tests.
- `packages/core/src/sync/index.ts` + `packages/core/src/index.ts` — export `PairingStore` + `PairedDevice`.
- `packages/app/src/main/lan-host-server.ts` — wire `PairingStore` + device identity + `isValidToken`/`recordPairing` into `DavContext`.
- `packages/app/src/main/ipc.ts` — rework `lan:connectAndSync` (info → token-or-PIN, store pairing); add `lan:listPairedDevices`, `lan:unpairDevice`.
- `packages/app/src/preload/index.ts` — `lan.listPairedDevices`, `lan.unpairDevice`; `connectAndSync` `pin` optional.
- `packages/shared-ui/src/api.ts` — types for the above; `connectAndSync` return adds `{ needsPin: true; peerName: string }`.
- `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx` — "已连接设备" list + delete; handle `needsPin` (prompt then retry).

---

## Task 1: `PairingStore` (per-library paired-devices file)

**Files:**
- Create: `packages/core/src/sync/pairing-store.ts`
- Test: `packages/core/src/sync/pairing-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/sync/pairing-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { PairingStore } from './pairing-store.js'

describe('PairingStore', () => {
  let root: string
  let store: PairingStore
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pair-')) + '/lib'
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    store = new PairingStore(root, new NodeFS())
  })

  it('starts empty', async () => {
    expect(await store.list()).toEqual([])
    expect(await store.hasToken('x')).toBe(false)
    expect(await store.findByDeviceId('d1')).toBeUndefined()
  })

  it('adds, finds, validates token, lists', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    expect((await store.list()).length).toBe(1)
    expect((await store.findByDeviceId('d1'))?.token).toBe('tok1')
    expect(await store.hasToken('tok1')).toBe(true)
    expect(await store.hasToken('nope')).toBe(false)
    const rec = await store.findByDeviceId('d1')
    expect(rec?.linkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)   // ISO timestamp stamped on add
  })

  it('dedupes by peerDeviceId (re-link updates token)', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad Pro', peerLibraryId: 'L1', token: 'tok2' })
    const list = await store.list()
    expect(list.length).toBe(1)
    expect(list[0].token).toBe('tok2')
    expect(list[0].peerDeviceName).toBe('iPad Pro')
    expect(await store.hasToken('tok1')).toBe(false)
  })

  it('removes by deviceId', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    await store.removeByDeviceId('d1')
    expect(await store.list()).toEqual([])
    expect(await store.hasToken('tok1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/platform-node build && pnpm --filter @banjuan/core exec vitest run src/sync/pairing-store.test.ts`
Expected: FAIL — `Cannot find module './pairing-store.js'`.

- [ ] **Step 3: Implement**

Create `packages/core/src/sync/pairing-store.ts`:

```typescript
import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'

export interface PairedDevice {
  peerDeviceId: string
  peerDeviceName: string
  peerLibraryId: string
  token: string         // shared durable secret used for Basic auth in both directions
  linkedAt: string      // ISO timestamp
}

// Input to addOrUpdate — linkedAt is stamped by the store.
export type PairingInput = Omit<PairedDevice, 'linkedAt'>

/** Per-library, device-local store of linked peer devices (never synced). */
export class PairingStore {
  private readonly path: string
  constructor(rootPath: string, private fs: PlatformFS) {
    this.path = join(rootPath, '.banjuan', 'paired-devices.json')
  }

  async list(): Promise<PairedDevice[]> {
    if (!(await this.fs.exists(this.path))) return []
    try {
      const data = JSON.parse(await this.fs.readTextFile(this.path))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  async findByDeviceId(peerDeviceId: string): Promise<PairedDevice | undefined> {
    return (await this.list()).find(d => d.peerDeviceId === peerDeviceId)
  }

  async hasToken(token: string): Promise<boolean> {
    if (!token) return false
    return (await this.list()).some(d => d.token === token)
  }

  /** Add a pairing, or replace the existing one for the same peerDeviceId. */
  async addOrUpdate(input: PairingInput): Promise<void> {
    const list = (await this.list()).filter(d => d.peerDeviceId !== input.peerDeviceId)
    list.push({ ...input, linkedAt: new Date().toISOString() })
    await this.fs.writeTextFile(this.path, JSON.stringify(list, null, 2))
  }

  async removeByDeviceId(peerDeviceId: string): Promise<void> {
    const list = (await this.list()).filter(d => d.peerDeviceId !== peerDeviceId)
    await this.fs.writeTextFile(this.path, JSON.stringify(list, null, 2))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/pairing-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from barrels**

In `packages/core/src/sync/index.ts`, add:
```typescript
export { PairingStore } from './pairing-store.js'
export type { PairedDevice, PairingInput } from './pairing-store.js'
```
In `packages/core/src/index.ts`, after the existing sync exports add:
```typescript
export { PairingStore } from './sync/index.js'
export type { PairedDevice, PairingInput } from './sync/index.js'
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS.

```bash
git add packages/core/src/sync/pairing-store.ts packages/core/src/sync/pairing-store.test.ts packages/core/src/sync/index.ts packages/core/src/index.ts
git commit -m "feat(sync): add PairingStore (per-library paired-devices.json)"
```

---

## Task 2: Exclude `paired-devices.json` from sync (client + host)

**Files:**
- Modify: `packages/core/src/sync/service.ts`
- Modify: `packages/core/src/sync/lan-host-handler.ts`
- Test: `packages/core/src/sync/lan-host-handler.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/sync/lan-host-handler.test.ts`, add inside the describe block:

```typescript
  it('refuses direct access to .banjuan/paired-devices.json (trust stays local)', async () => {
    const auth = { authorization: basic('secrettoken') }
    expect((await handleDavRequest({ method: 'GET', path: '/.banjuan/paired-devices.json', headers: auth }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'PUT', path: '/.banjuan/paired-devices.json', headers: auth, body: new TextEncoder().encode('[]') }, ctx)).status).toBe(403)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: FAIL — paired-devices.json is not yet host-blocked (GET returns 404/200, not 403).

- [ ] **Step 3: Add the path to both exclusion sets**

In `packages/core/src/sync/service.ts`, change `SYNC_EXCLUDED_PATHS` to:
```typescript
const SYNC_EXCLUDED_PATHS = new Set([
  '.banjuan/config.json',
  '.banjuan/paired-devices.json',
])
```

In `packages/core/src/sync/lan-host-handler.ts`, change `HOST_EXCLUDED_FULL_PATHS` to:
```typescript
const HOST_EXCLUDED_FULL_PATHS = new Set([
  '.banjuan/config.json',
  '.banjuan/paired-devices.json',
])
```

- [ ] **Step 4: Run tests + full sync suite**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/`
Expected: all PASS (handler test count +1).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/service.ts packages/core/src/sync/lan-host-handler.ts packages/core/src/sync/lan-host-handler.test.ts
git commit -m "feat(sync): exclude paired-devices.json from sync + host access (trust stays local)"
```

---

## Task 3: Host `/.banjuan-info` + persistent-token auth + PIN records peer

**Files:**
- Modify: `packages/core/src/sync/lan-host-handler.ts`
- Test: `packages/core/src/sync/lan-host-handler.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/sync/lan-host-handler.test.ts`, add inside the describe block:

```typescript
  it('GET /.banjuan-info returns identity without auth', async () => {
    const res = await handleDavRequest({ method: 'GET', path: '/.banjuan-info', headers: {} }, ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.libraryId).toBe('LIB123')
    expect(body.libraryName).toBe('My Room')
    expect(body).toHaveProperty('deviceId')
    expect(body).toHaveProperty('deviceName')
  })

  it('accepts a token reported valid by ctx.isValidToken (persistent pairing)', async () => {
    const ctx2 = { ...ctx, token: 'unused', isValidToken: async (t: string) => t === 'storedtok' }
    // wrong token -> 401
    expect((await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: { authorization: basic('nope') } }, ctx2)).status).toBe(401)
    // stored token -> served
    expect((await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: { authorization: basic('storedtok') } }, ctx2)).status).toBe(200)
  })

  it('pairing records the peer and returns a minted token via recordPairing', async () => {
    const recorded: any[] = []
    const ctx3 = {
      ...ctx,
      deviceId: 'HOSTDEV', deviceName: 'Mac',
      recordPairing: async (peerDeviceId: string, peerDeviceName: string, peerLibraryId: string) => {
        recorded.push({ peerDeviceId, peerDeviceName, peerLibraryId })
        return 'minted-token'
      },
    }
    const res = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456', deviceId: 'CLIENTDEV', deviceName: 'iPad', libraryId: 'CLIENTLIB' } }, ctx3)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.token).toBe('minted-token')
    expect(body.deviceId).toBe('HOSTDEV')
    expect(recorded[0]).toEqual({ peerDeviceId: 'CLIENTDEV', peerDeviceName: 'iPad', peerLibraryId: 'CLIENTLIB' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: FAIL — no `/.banjuan-info` route; `isValidToken`/`recordPairing` not honored.

- [ ] **Step 3: Extend `DavContext`**

In `packages/core/src/sync/lan-host-handler.ts`, replace the `DavContext` interface with:

```typescript
export interface DavContext {
  rootPath: string
  fs: PlatformFS
  token: string
  pin: string
  pairPath?: string                     // default '/.banjuan-pair'
  infoPath?: string                     // default '/.banjuan-info'
  libraryId?: string
  libraryName?: string
  deviceId?: string
  deviceName?: string
  // Persistent pairing (injected by the host): accept any stored token, and
  // record a freshly PIN-paired peer (returning the minted durable token).
  isValidToken?: (token: string) => Promise<boolean>
  recordPairing?: (peerDeviceId: string, peerDeviceName: string, peerLibraryId: string) => Promise<string>
}
```

- [ ] **Step 4: Add the info route + update pair + auth**

In `routeDavRequest`, just after `const method = req.method.toUpperCase()`, add the info route (before the pair route):

```typescript
  const infoPath = ctx.infoPath ?? '/.banjuan-info'

  // --- Identity discovery (no auth): GET /.banjuan-info ---
  if (method === 'GET' && req.path === infoPath) {
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      deviceId: ctx.deviceId ?? '', deviceName: ctx.deviceName ?? '',
      libraryId: ctx.libraryId ?? '', libraryName: ctx.libraryName ?? '',
    }) }
  }
```

Replace the pair endpoint's success branch so it reads the client device info, mints+records a durable token (falling back to `ctx.token` when no `recordPairing` is injected), and returns full identity:

```typescript
  if (method === 'GET' && req.path === pairPath) {
    const pin = req.query?.pin ?? ''
    if (pin === ctx.pin) {
      const peerDeviceId = req.query?.deviceId ?? ''
      const peerDeviceName = req.query?.deviceName ?? ''
      const peerLibraryId = req.query?.libraryId ?? ''
      const token = ctx.recordPairing
        ? await ctx.recordPairing(peerDeviceId, peerDeviceName, peerLibraryId)
        : ctx.token
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        token,
        deviceId: ctx.deviceId ?? '', deviceName: ctx.deviceName ?? '',
        libraryId: ctx.libraryId ?? '', libraryName: ctx.libraryName ?? '',
      }) }
    }
    return { status: 403, headers: {}, body: 'Bad PIN' }
  }
```

Update the auth check. It currently is:
```typescript
  const supplied = parseBasicAuthPassword(req.headers['authorization'])
  if (supplied === null || !verifyToken(ctx.token, supplied)) return unauthorized()
```
Replace with (accept the primary token OR any stored token):
```typescript
  const supplied = parseBasicAuthPassword(req.headers['authorization'])
  if (supplied === null) return unauthorized()
  const ok = verifyToken(ctx.token, supplied) || (ctx.isValidToken ? await ctx.isValidToken(supplied) : false)
  if (!ok) return unauthorized()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: PASS (existing tests + the 3 new ones). The existing tests use `ctx.token='secrettoken'` with no `isValidToken`, so `verifyToken(ctx.token, supplied)` still authorizes them.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS.

```bash
git add packages/core/src/sync/lan-host-handler.ts packages/core/src/sync/lan-host-handler.test.ts
git commit -m "feat(sync): host /.banjuan-info + persistent-token auth + PIN records peer"
```

---

## Task 4: Device identity + wire persistent pairing into `LanHostServer`

**Files:**
- Create: `packages/app/src/main/device-identity.ts`
- Modify: `packages/app/src/main/lan-host-server.ts`

- [ ] **Step 1: Create the device identity helper**

Create `packages/app/src/main/device-identity.ts`:

```typescript
import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
}

// Stable per-install identity, stored device-global at ~/.banjuan/device.json.
export function getDeviceIdentity(): DeviceIdentity {
  const dir = join(homedir(), '.banjuan')
  const path = join(dir, 'device.json')
  try {
    const d = JSON.parse(readFileSync(path, 'utf-8'))
    if (d && typeof d.deviceId === 'string' && d.deviceId) return d
  } catch { /* missing/corrupt — recreate below */ }
  const identity: DeviceIdentity = { deviceId: randomUUID().replace(/-/g, ''), deviceName: hostname() }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(identity, null, 2))
  return identity
}
```

- [ ] **Step 2: Wire it into LanHostServer**

In `packages/app/src/main/lan-host-server.ts`:

(a) Add imports:
```typescript
import { PairingStore } from '@banjuan/core'
import { getDeviceIdentity } from './device-identity.js'
```

(b) In `start()`, after the `libraryId`/`libraryName` block and before building `ctx`, add:
```typescript
    const identity = getDeviceIdentity()
    const pairingStore = new PairingStore(this.rootPath, this.fs)
```

(c) Replace the `const ctx: DavContext = { ... }` line with:
```typescript
    const ctx: DavContext = {
      rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin,
      libraryId, libraryName,
      deviceId: identity.deviceId, deviceName: identity.deviceName,
      isValidToken: (t) => pairingStore.hasToken(t),
      recordPairing: async (peerDeviceId, peerDeviceName, peerLibraryId) => {
        const token = toHex(randomBytes(16))
        await pairingStore.addOrUpdate({ peerDeviceId, peerDeviceName, peerLibraryId, token })
        return token
      },
    }
```

(d) Add a `toHex` helper near the top of the file (after imports):
```typescript
function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}
```
(`randomBytes` is already imported from `node:crypto`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/core build && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: app shows only pre-existing errors (SearchOptions, WelcomeView WebkitAppRegion ×2, zotero-pdfjs-dist ×4); none referencing device-identity.ts or lan-host-server.ts.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/main/device-identity.ts packages/app/src/main/lan-host-server.ts
git commit -m "feat(sync): device identity + wire persistent pairing into LanHostServer"
```

---

## Task 5: `connectAndSync` reconnect-or-link + list/unpair IPC

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Replace the `lan:connectAndSync` handler**

In `packages/app/src/main/ipc.ts`, replace the entire current `lan:connectAndSync` handler with:

```typescript
  // Client side: discover the peer's identity, reconnect with a stored token if
  // already paired (no PIN), otherwise PIN-link (and store the pairing). Then
  // guard against merging a different book-room, then run a bidirectional sync.
  ipcMain.handle('lan:connectAndSync', async (event, peerUrl: string, pin: string, force?: boolean) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('PAIR_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')
    const { PairingStore } = await import('@banjuan/core')
    const store = new PairingStore(library.rootPath, deps.fs)
    const me = getDeviceIdentity()
    const myLibraryId = await library.getId()

    // 1) Discover the peer.
    const infoResp = await fetch(`${base}/.banjuan-info`)
    if (!infoResp.ok) throw new Error(`PAIR_FAILED:${infoResp.status}`)
    const info = await infoResp.json() as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
    const hostDeviceId = info.deviceId ?? ''
    const hostLibraryId = info.libraryId ?? ''
    const hostLibraryName = info.libraryName ?? ''

    // 2) Reconnect (paired) or link (PIN).
    let token: string
    const existing = hostDeviceId ? await store.findByDeviceId(hostDeviceId) : undefined
    if (existing) {
      token = existing.token
    } else {
      if (!pin) return { needsPin: true as const, peerName: hostLibraryName }
      const q = new URLSearchParams({ pin, deviceId: me.deviceId, deviceName: me.deviceName, libraryId: myLibraryId })
      const pairResp = await fetch(`${base}/.banjuan-pair?${q.toString()}`)
      if (!pairResp.ok) throw new Error(`PAIR_FAILED:${pairResp.status}`)
      const paired = await pairResp.json() as { token?: string }
      if (!paired.token) throw new Error('PAIR_FAILED:no-token')
      token = paired.token
      if (hostDeviceId) {
        await store.addOrUpdate({ peerDeviceId: hostDeviceId, peerDeviceName: info.deviceName ?? '', peerLibraryId: hostLibraryId, token })
      }
    }

    // 3) Book-room identity guard.
    if (hostLibraryId && hostLibraryId !== myLibraryId) {
      const isEmpty = (await library.documents.list()).length === 0
      if (isEmpty || force) {
        await library.adoptLibraryId(hostLibraryId)
      } else {
        return { needsConfirm: true as const, peerName: hostLibraryName, localName: await library.getName() }
      }
    }

    // 4) Sync (reuse the existing WebDAVAdapter unchanged; Basic auth, password = token).
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

(`getDeviceIdentity` is imported at the top of ipc.ts in Step 3.)

- [ ] **Step 2: Add list + unpair handlers**

Immediately after the `lan:connectAndSync` handler, add:

```typescript
  ipcMain.handle('lan:listPairedDevices', async (event) => {
    const library = getLib(event)
    const { PairingStore } = await import('@banjuan/core')
    return new PairingStore(library.rootPath, deps.fs).list()
  })

  ipcMain.handle('lan:unpairDevice', async (event, peerDeviceId: string) => {
    const library = getLib(event)
    const { PairingStore } = await import('@banjuan/core')
    await new PairingStore(library.rootPath, deps.fs).removeByDeviceId(peerDeviceId)
  })
```

- [ ] **Step 3: Add the device-identity import**

At the top of `packages/app/src/main/ipc.ts`, add to the imports:
```typescript
import { getDeviceIdentity } from './device-identity.js'
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors; nothing referencing the lan handlers, getDeviceIdentity, PairingStore.

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(sync): connectAndSync reconnect-or-link via stored token; list/unpair IPC"
```

---

## Task 6: Preload + API types for pairing management

**Files:**
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/shared-ui/src/api.ts`

- [ ] **Step 1: Preload — add list/unpair, keep connectAndSync**

In `packages/app/src/preload/index.ts`, inside the `lan` object, add after `connectAndSync`:

```typescript
    listPairedDevices: () => ipcRenderer.invoke('lan:listPairedDevices'),
    unpairDevice: (peerDeviceId: string) => ipcRenderer.invoke('lan:unpairDevice', peerDeviceId),
```

(The `connectAndSync` preload entry is unchanged from Plan 1 — it already forwards `force`; `pin` may now be an empty string for a reconnect, which is fine.)

- [ ] **Step 2: API types**

In `packages/shared-ui/src/api.ts`, in the `lan` member: (a) widen `connectAndSync`'s return union to add the `needsPin` arm; (b) add `listPairedDevices` and `unpairDevice`.

Replace the `connectAndSync` return union with:
```typescript
    ): Promise<
      | { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; stubbed: number; errors: string[] }
      | { needsConfirm: true; peerName: string; localName: string }
      | { needsPin: true; peerName: string }
    >
```

And add these two members alongside it:
```typescript
    listPairedDevices(): Promise<Array<{ peerDeviceId: string; peerDeviceName: string; peerLibraryId: string; token: string; linkedAt: string }>>
    unpairDevice(peerDeviceId: string): Promise<void>
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: shared-ui PASS *except* the existing `connectPeer` in SyncConfigPanel may need the `needsPin` arm handled — if tsc errors there, that's fixed in Task 7; note it. app only pre-existing errors.

```bash
git add packages/app/src/preload/index.ts packages/shared-ui/src/api.ts
git commit -m "feat(sync): preload/api for listPairedDevices, unpairDevice, needsPin"
```

---

## Task 7: UI — paired-devices list, delete, and PIN-only-when-needed

**Files:**
- Modify: `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`

- [ ] **Step 1: Add paired-devices state + load + unpair**

Near the other LAN state in `SyncConfigPanel`, add:
```typescript
  const [pairedDevices, setPairedDevices] = useState<Array<{ peerDeviceId: string; peerDeviceName: string; peerLibraryId: string; linkedAt: string }>>([])

  const loadPaired = async () => {
    try { setPairedDevices(await api.lan.listPairedDevices()) } catch { setPairedDevices([]) }
  }

  const unpair = async (peerDeviceId: string) => {
    await api.lan.unpairDevice(peerDeviceId)
    await loadPaired()
  }
```

In the existing mount `useEffect` loader (the one calling `api.lan.getHostStatus()`), add a call after it:
```typescript
      await loadPaired()
```

- [ ] **Step 2: Handle `needsPin` in `connectPeer`, and refresh the list after linking**

Replace the body of `connectPeer` with (it now connects WITHOUT a PIN first; the host asks for one only if unpaired):
```typescript
  const connectPeer = async () => {
    if (!peerUrl) { setLanMsg('请输入对方地址'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    const onProgress = (p: { phase: string; current: number; total: number; currentFile: string }) =>
      setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`)
    try {
      let r = await api.lan.connectAndSync(peerUrl, peerPin, onProgress)
      if ('needsPin' in r) {
        if (!/^\d{6}$/.test(peerPin)) { setLanMsg('对方设备尚未配对,请输入 6 位 PIN 后再连接'); return }
        r = await api.lan.connectAndSync(peerUrl, peerPin, onProgress)
      }
      if ('needsConfirm' in r) {
        const ok = confirm(`对方是不同的书房「${r.peerName}」,当前是「${r.localName}」。继续会把两个书房合并,通常你不想这样。确定继续吗?`)
        if (!ok) { setLanMsg('已取消'); return }
        setLanMsg('合并中…')
        const r2 = await api.lan.connectAndSync(peerUrl, peerPin, onProgress, true)
        if ('needsConfirm' in r2 || 'needsPin' in r2) { setLanMsg('已取消'); return }
        showSyncResult(r2); await loadPaired(); return
      }
      showSyncResult(r); await loadPaired()
    } catch (e: any) {
      setLanMsg(`失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }
```

(Behavior: first connect sends the current `peerPin` — empty on a fresh attempt. If the peer is already paired the host won't need it; if not, the handler returns `needsPin`, and the UI asks the user to type the 6-digit PIN then retries. `showSyncResult` is the helper added in Plan 1.)

- [ ] **Step 3: Render the "已连接设备" list**

In the JSX, after the "连接附近设备" block, add a paired-devices section (match the panel's inline-style idiom — these mirror the existing labels/colors):
```tsx
        <div style={{ marginTop: 18 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>已连接设备</div>
          {pairedDevices.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-mute, #8A8377)' }}>还没有链接任何设备</div>
          ) : (
            pairedDevices.map(d => (
              <div key={d.peerDeviceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--paper-edge, #eee)' }}>
                <div style={{ fontSize: 13 }}>
                  <div style={{ color: 'var(--ink, #2A2722)' }}>{d.peerDeviceName || d.peerDeviceId}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute, #8A8377)' }}>{new Date(d.linkedAt).toLocaleString()}</div>
                </div>
                <button onClick={() => unpair(d.peerDeviceId)} disabled={lanBusy}
                  style={{ fontSize: 12, color: '#c0392b', background: 'none', border: '1px solid var(--paper-edge, #e5e5e7)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  断开
                </button>
              </div>
            ))
          )}
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: PASS (the `needsPin`/`needsConfirm` arms are all handled, so the union narrows cleanly).

- [ ] **Step 5: Manual verification (rebuild core first)**

1. `pnpm --filter @banjuan/core build && pnpm --filter @banjuan/platform-node build`, restart `pnpm dev`.
2. Window A (book-room A) → 开启共享 → URL + PIN. Window B (empty or same room) → enter URL only → 连接并同步 → prompted for PIN (first time) → links, syncs. "已连接设备" shows the peer on both sides.
3. Stop & re-open sharing on A (new PIN). On B → enter URL only → 连接并同步 → **no PIN asked** (reconnects via stored token).
4. On B, "断开" the device → connect again → PIN asked again (re-link).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/src/components/sync/SyncConfigPanel.tsx
git commit -m "feat(sync): paired-devices list + delete + PIN-only-when-unpaired"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Device identity (`~/.banjuan/device.json`) → Task 4. ✓
- Per-library paired-devices store, not synced → Tasks 1, 2. ✓
- Host `/.banjuan-info` + persistent-token auth + PIN mints/records durable token → Task 3, wired in Task 4. ✓
- Client reconnect-or-link (token vs PIN), store pairing → Task 5. ✓
- Identity guard (Plan 1) preserved in the new flow → Task 5 step 1 (carried forward). ✓
- list / delete (unpair) + UI → Tasks 5, 6, 7. ✓
- PIN only for new devices → Task 5 (`needsPin`) + Task 7 UI. ✓

**Type consistency:** `PairedDevice`/`PairingInput` (Task 1) used in Tasks 3–7. `PairingStore` methods (`list/findByDeviceId/hasToken/addOrUpdate/removeByDeviceId`) consistent across Tasks 1, 4, 5. `DavContext` additions (`infoPath/deviceId/deviceName/isValidToken/recordPairing`) defined in Task 3, populated in Task 4. `recordPairing(peerDeviceId, peerDeviceName, peerLibraryId) → token` signature matches between handler call (Task 3) and LanHostServer impl (Task 4). `connectAndSync` return union (`SyncResult | needsConfirm | needsPin`) consistent across Tasks 5 (ipc), 6 (api), 7 (ui). `getDeviceIdentity()` defined in Task 4, used in Tasks 4 & 5.

**Placeholder scan:** none — every step has concrete code and exact commands.

**Build note:** core/platform-node resolve via `dist/`; manual verification rebuilds them before `pnpm dev`. Existing Plan-1 handler tests keep passing because `ctx.token` remains an accepted token alongside the new `isValidToken`.
