# LAN Discovery + Connect/Sync Split Implementation Plan (Desktop)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover nearby shared libraries over mDNS (showing device + library name) and make "连接"(one-time pair) and "同步" two separate actions — the Bluetooth pairing model — on desktop.

**Architecture:** A Node `DiscoveryService` (bonjour-service) advertises `_banjuan-sync._tcp` when hosting and browses for peers when scanning. The single `connectAndSync` IPC is split into `lan:pairDevice` (PIN → store token, no data movement) and `lan:syncDevice` (look up the stored token → book-room guard → sync). The book-room merge guard moves from pair-time to sync-time. The UI gets a "附近的共享" scan list (连接/同步 per row) plus the existing paired-devices list.

**Tech Stack:** TypeScript, `bonjour-service` (Node mDNS), existing `PairingStore` / `/.banjuan-info` / `/.banjuan-pair` / `LanHostServer` / `SyncService` / `getDeviceIdentity`, Electron IPC + preload, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-lan-discovery-connect-sync-design.md`

**Scope — desktop only.** Mobile (iPad) discovery + LAN client is a separate follow-on (Spec B): Capacitor zeroconf, iOS local-network permission, mobile pair/sync wiring. This plan reuses pieces that the mobile work will share (PairingStore, host endpoints, the new UI).

---

## File Structure

**Create:**
- `packages/app/src/main/discovery-service.ts` — mDNS advertise/scan + pure `parseNearbyService`.
- `packages/app/src/main/discovery-service.test.ts` — unit test for `parseNearbyService`.

**Modify:**
- `packages/app/package.json` — add `bonjour-service` dependency.
- `packages/app/src/main/ipc.ts` — module-level `DiscoveryService`; advertise on `lan:startHost`, stop on `lan:stopHost`; add `lan:scanNearby`, `lan:pairDevice`, `lan:syncDevice`; remove `lan:connectAndSync`.
- `packages/app/src/preload/index.ts` — add `scanNearby`/`pairDevice`/`syncDevice`; remove `connectAndSync`.
- `packages/shared-ui/src/api.ts` — types for the above; remove `connectAndSync`.
- `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx` — "附近的共享" scan list + 连接/同步 split; rework `connectPeer` into pair + sync; keep manual-entry fallback + paired list.

---

## Task 1: `DiscoveryService` (mDNS advertise/scan) + `parseNearbyService`

**Files:**
- Modify: `packages/app/package.json`
- Create: `packages/app/src/main/discovery-service.ts`
- Test: `packages/app/src/main/discovery-service.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @banjuan/app add bonjour-service`
Expected: `bonjour-service` appears under `dependencies` in `packages/app/package.json`.

- [ ] **Step 2: Write the failing test**

Create `packages/app/src/main/discovery-service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseNearbyService } from './discovery-service.js'

describe('parseNearbyService', () => {
  it('maps a bonjour service (lowercase txt keys + IPv4) to a NearbyShare', () => {
    const n = parseNearbyService({
      port: 51234,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { deviceid: 'DEV1', devicename: 'Mac', libraryid: 'LIB1', libraryname: 'My Room' },
    })
    expect(n).toEqual({
      deviceId: 'DEV1', deviceName: 'Mac', libraryName: 'My Room', libraryId: 'LIB1',
      url: 'http://192.168.1.20:51234',
    })
  })

  it('returns null when there is no deviceId', () => {
    expect(parseNearbyService({ port: 1, addresses: ['192.168.1.5'], txt: {} })).toBeNull()
  })

  it('returns null when there is no IPv4 address', () => {
    expect(parseNearbyService({ port: 1, addresses: ['fe80::1'], txt: { deviceid: 'X' } })).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @banjuan/app exec vitest run src/main/discovery-service.test.ts`
Expected: FAIL — `Cannot find module './discovery-service.js'`. (If the app package has no `vitest` configured, run with the workspace vitest: `pnpm --filter @banjuan/app exec vitest run src/main/discovery-service.test.ts`; if that errors that vitest isn't found, add `"vitest": "^3.1.0"` to `packages/app` devDependencies via `pnpm --filter @banjuan/app add -D vitest` and a minimal `vitest.config.ts` is not needed for a plain unit test — vitest runs `.test.ts` by default.)

- [ ] **Step 4: Implement**

Create `packages/app/src/main/discovery-service.ts`:

```typescript
import { Bonjour } from 'bonjour-service'

const SERVICE_TYPE = 'banjuan-sync'   // advertises/browses as _banjuan-sync._tcp

export interface NearbyShare {
  deviceId: string
  deviceName: string
  libraryName: string
  libraryId: string
  url: string                          // e.g. "http://192.168.1.20:51234"
}

export interface AdvertiseOptions {
  port: number
  deviceId: string
  deviceName: string
  libraryId: string
  libraryName: string
}

// Shape of the subset of a bonjour Service we read (kept loose for testability).
interface BonjourServiceLike {
  port?: number
  addresses?: string[]
  txt?: Record<string, unknown>
}

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** Map a discovered bonjour service to a NearbyShare, or null if unusable. */
export function parseNearbyService(svc: BonjourServiceLike): NearbyShare | null {
  const txt = svc.txt ?? {}
  const deviceId = String(txt.deviceid ?? '')
  if (!deviceId) return null
  const ipv4 = (svc.addresses ?? []).find(a => IPV4.test(a))
  if (!ipv4 || !svc.port) return null
  return {
    deviceId,
    deviceName: String(txt.devicename ?? ''),
    libraryName: String(txt.libraryname ?? ''),
    libraryId: String(txt.libraryid ?? ''),
    url: `http://${ipv4}:${svc.port}`,
  }
}

/** mDNS advertise (when hosting) + browse (when scanning). Desktop/Node only. */
export class DiscoveryService {
  private bonjour = new Bonjour()
  private published: { stop: (cb?: () => void) => void } | null = null

  advertise(opts: AdvertiseOptions): void {
    this.stopAdvertise()
    this.published = this.bonjour.publish({
      name: `banjuan-${opts.deviceId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: opts.port,
      // DNS-SD TXT keys are case-insensitive — publish lowercase, read lowercase.
      txt: {
        deviceid: opts.deviceId,
        devicename: opts.deviceName,
        libraryid: opts.libraryId,
        libraryname: opts.libraryName,
      },
    }) as unknown as { stop: (cb?: () => void) => void }
  }

  stopAdvertise(): void {
    if (this.published) {
      try { this.published.stop() } catch { /* ignore */ }
      this.published = null
    }
  }

  /** Browse for nearby shares for `timeoutMs`, then resolve a de-duped snapshot. */
  scan(timeoutMs = 1500): Promise<NearbyShare[]> {
    return new Promise((resolve) => {
      const found = new Map<string, NearbyShare>()
      const browser = this.bonjour.find({ type: SERVICE_TYPE }, (svc) => {
        const n = parseNearbyService(svc as BonjourServiceLike)
        if (n) found.set(n.url, n)
      })
      setTimeout(() => {
        try { browser.stop() } catch { /* ignore */ }
        resolve([...found.values()])
      }, timeoutMs)
    })
  }

  destroy(): void {
    this.stopAdvertise()
    try { this.bonjour.destroy() } catch { /* ignore */ }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @banjuan/app exec vitest run src/main/discovery-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors (SearchOptions, WelcomeView WebkitAppRegion ×2, zotero-pdfjs-dist ×4); nothing referencing discovery-service.ts. (If `bonjour-service` lacks bundled types, `pnpm --filter @banjuan/app add -D @types/bonjour-service` — but bonjour-service ships its own types, so this is unlikely.)

- [ ] **Step 7: Commit**

```bash
git add packages/app/package.json packages/app/src/main/discovery-service.ts packages/app/src/main/discovery-service.test.ts
git commit -m "feat(sync): add DiscoveryService (mDNS advertise/scan) + parseNearbyService"
```

---

## Task 2: Advertise on host start/stop + `lan:scanNearby`

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Add a module-level DiscoveryService + import**

At the top of `packages/app/src/main/ipc.ts`, add to the local imports:
```typescript
import { DiscoveryService } from './discovery-service.js'
```
Just after `let lanHostOwner: number | null = null` (and the `HOST_OFFLINE` const), add:
```typescript
const discovery = new DiscoveryService()
```

- [ ] **Step 2: Advertise when hosting starts**

The current `lan:startHost` handler is:
```typescript
  ipcMain.handle('lan:startHost', async (event): Promise<HostStatus> => {
    const library = getLib(event)
    if (lanHost) { await lanHost.stop(); lanHost = null }
    const host = new LanHostServer(library.rootPath, deps.fs)
    const status = await host.start()   // assign only on success — a failed start leaves lanHost null
    lanHost = host
    lanHostOwner = event.sender.id
    return status
  })
```
Replace it with (advertise after a successful start, using the same identity the host serves):
```typescript
  ipcMain.handle('lan:startHost', async (event): Promise<HostStatus> => {
    const library = getLib(event)
    if (lanHost) { await lanHost.stop(); lanHost = null }
    const host = new LanHostServer(library.rootPath, deps.fs)
    const status = await host.start()   // assign only on success — a failed start leaves lanHost null
    lanHost = host
    lanHostOwner = event.sender.id
    if (status.port) {
      const me = getDeviceIdentity()
      discovery.advertise({
        port: status.port,
        deviceId: me.deviceId,
        deviceName: me.deviceName,
        libraryId: await library.getId(),
        libraryName: await library.getName(),
      })
    }
    return status
  })
```

- [ ] **Step 3: Stop advertising when hosting stops**

The current `lan:stopHost`:
```typescript
  ipcMain.handle('lan:stopHost', async (event): Promise<void> => {
    if (lanHost && lanHostOwner === event.sender.id) {
      await lanHost.stop(); lanHost = null; lanHostOwner = null
    }
  })
```
Replace with:
```typescript
  ipcMain.handle('lan:stopHost', async (event): Promise<void> => {
    if (lanHost && lanHostOwner === event.sender.id) {
      await lanHost.stop(); lanHost = null; lanHostOwner = null
      discovery.stopAdvertise()
    }
  })
```

Also update the existing `before-quit` cleanup (currently `app.on('before-quit', () => { if (lanHost) { void lanHost.stop(); lanHost = null } })`) to also stop discovery:
```typescript
  app.on('before-quit', () => {
    discovery.destroy()
    if (lanHost) { void lanHost.stop(); lanHost = null; lanHostOwner = null }
  })
```

- [ ] **Step 4: Add the scan handler**

Immediately after `lan:getHostStatus`, add:
```typescript
  ipcMain.handle('lan:scanNearby', async () => {
    return discovery.scan()
  })
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors; nothing referencing discovery / scanNearby.

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(sync): advertise mDNS while hosting + lan:scanNearby"
```

---

## Task 3: Split into `lan:pairDevice` + `lan:syncDevice` (remove `connectAndSync`)

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Replace the `lan:connectAndSync` handler with two handlers**

Delete the entire current `ipcMain.handle('lan:connectAndSync', ...)` handler and insert in its place:

```typescript
  // 连接 = one-time pairing (no data movement): store a durable token for the peer.
  ipcMain.handle('lan:pairDevice', async (event, peerUrl: string, pin: string) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('PAIR_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')
    const { PairingStore } = await import('@banjuan/core')
    const store = new PairingStore(library.rootPath, deps.fs)
    const me = getDeviceIdentity()
    const myLibraryId = await library.getId()

    const infoResp = await fetch(`${base}/.banjuan-info`)
    if (!infoResp.ok) throw new Error(`PAIR_FAILED:${infoResp.status}`)
    const info = await infoResp.json() as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
    const hostDeviceId = info.deviceId ?? ''
    if (!hostDeviceId) throw new Error('PAIR_FAILED:no-device-id')

    const q = new URLSearchParams({ pin, deviceId: me.deviceId, deviceName: me.deviceName, libraryId: myLibraryId })
    const pairResp = await fetch(`${base}/.banjuan-pair?${q.toString()}`)
    if (!pairResp.ok) throw new Error(`PAIR_FAILED:${pairResp.status}`)
    const paired = await pairResp.json() as { token?: string }
    if (!paired.token) throw new Error('PAIR_FAILED:no-token')

    await store.addOrUpdate({
      peerDeviceId: hostDeviceId,
      peerDeviceName: info.deviceName ?? '',
      peerLibraryId: info.libraryId ?? '',
      token: paired.token,
    })
    return { ok: true as const, deviceName: info.deviceName ?? '', libraryName: info.libraryName ?? '' }
  })

  // 同步 = data transfer for an already-paired peer. Guards against merging a
  // different book-room (the guard lives here, not at pair time).
  ipcMain.handle('lan:syncDevice', async (event, peerUrl: string, force?: boolean) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('SYNC_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')
    const { PairingStore, SyncService, WebDAVAdapter } = await import('@banjuan/core')
    const store = new PairingStore(library.rootPath, deps.fs)
    const myLibraryId = await library.getId()

    const infoResp = await fetch(`${base}/.banjuan-info`)
    if (!infoResp.ok) throw new Error(`SYNC_FAILED:${infoResp.status}`)
    const info = await infoResp.json() as { deviceId?: string; libraryId?: string; libraryName?: string }
    const hostDeviceId = info.deviceId ?? ''
    const hostLibraryId = info.libraryId ?? ''
    const hostLibraryName = info.libraryName ?? ''

    const existing = hostDeviceId ? await store.findByDeviceId(hostDeviceId) : undefined
    if (!existing) return { needsPair: true as const }
    const token = existing.token

    // Book-room identity guard (at sync time).
    if (hostLibraryId && hostLibraryId !== myLibraryId) {
      const isEmpty = (await library.documents.list()).length === 0
      if (isEmpty || force) {
        await library.adoptLibraryId(hostLibraryId)
      } else {
        return { needsConfirm: true as const, peerName: hostLibraryName, localName: await library.getName() }
      }
    }

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

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors; nothing referencing the removed `connectAndSync` (the preload/api still reference it until Task 4 — if app tsc flags the preload's `lan:connectAndSync` invoke, that's fine since invoke strings aren't typechecked; the real removal of the preload entry is Task 4. Confirm no NEW handler errors).

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(sync): split connectAndSync into lan:pairDevice + lan:syncDevice"
```

---

## Task 4: Preload + API types (scanNearby/pairDevice/syncDevice; drop connectAndSync)

**Files:**
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/shared-ui/src/api.ts`

- [ ] **Step 1: Preload — replace `connectAndSync` with the three new methods**

In `packages/app/src/preload/index.ts`, in the `lan` object, replace the whole `connectAndSync: (…) => { … },` entry with:

```typescript
    scanNearby: () => ipcRenderer.invoke('lan:scanNearby'),
    pairDevice: (peerUrl: string, pin: string) => ipcRenderer.invoke('lan:pairDevice', peerUrl, pin),
    syncDevice: (peerUrl: string, onProgress?: (p: any) => void, force?: boolean) => {
      const handler = onProgress ? (_e: any, p: any) => onProgress(p) : null
      if (handler) ipcRenderer.on('sync:progress', handler)
      return ipcRenderer.invoke('lan:syncDevice', peerUrl, force).finally(() => {
        if (handler) ipcRenderer.removeListener('sync:progress', handler)
      })
    },
```

(Leave `startHost`/`stopHost`/`getHostStatus`/`listPairedDevices`/`unpairDevice` unchanged.)

- [ ] **Step 2: API types — replace `connectAndSync` member**

In `packages/shared-ui/src/api.ts`, in the `lan` member, remove the entire `connectAndSync(...)` signature and add:

```typescript
    scanNearby(): Promise<Array<{ deviceId: string; deviceName: string; libraryName: string; libraryId: string; url: string }>>
    pairDevice(peerUrl: string, pin: string): Promise<{ ok: true; deviceName: string; libraryName: string }>
    syncDevice(
      peerUrl: string,
      onProgress?: (p: { phase: string; current: number; total: number; currentFile: string }) => void,
      force?: boolean,
    ): Promise<
      | { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; stubbed: number; errors: string[] }
      | { needsConfirm: true; peerName: string; localName: string }
      | { needsPair: true }
    >
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: FAIL only inside `SyncConfigPanel.tsx` (it still calls the removed `api.lan.connectAndSync`). That's fixed in Task 5 — confirm the errors are confined to SyncConfigPanel.tsx; list them.
Run: `pnpm --filter @banjuan/app exec tsc --noEmit` → only pre-existing + the same SyncConfigPanel errors via dependency.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/preload/index.ts packages/shared-ui/src/api.ts
git commit -m "feat(sync): preload/api for scanNearby/pairDevice/syncDevice (drop connectAndSync)"
```

---

## Task 5: UI — "附近的共享" scan list + connect/sync split

**Files:**
- Modify: `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`

READ the file first. The current "局域网直连" section has: a host toggle block, a "连接附近设备" manual block with `peerUrl`/`peerPin` inputs and a `connectPeer` that calls `api.lan.connectAndSync`, an `{lanMsg}` line, and a "已连接设备" list. `showSyncResult(r)`, `loadPaired()`, `pairedDevices`, `unpair()`, `peerUrl`, `peerPin`, `lanBusy`, `lanMsg` already exist.

- [ ] **Step 1: Add nearby-scan state + helpers**

Near the other LAN state, add:
```typescript
  const [nearby, setNearby] = useState<Array<{ deviceId: string; deviceName: string; libraryName: string; libraryId: string; url: string }>>([])
  const [scanning, setScanning] = useState(false)

  const pairedIds = new Set(pairedDevices.map(d => d.peerDeviceId))

  const scanNearby = async () => {
    setScanning(true)
    setLanMsg('')
    try { setNearby(await api.lan.scanNearby()) } finally { setScanning(false) }
  }

  const connectNearby = async (url: string) => {
    if (!/^\d{6}$/.test(peerPin)) { setLanMsg('请输入对方显示的 6 位 PIN'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    try {
      const r = await api.lan.pairDevice(url, peerPin)
      setLanMsg(`已连接「${r.libraryName || r.deviceName}」`)
      await loadPaired()
    } catch (e: any) {
      setLanMsg(`连接失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }

  const syncWith = async (url: string) => {
    setLanBusy(true)
    setLanMsg('同步中…')
    const onProgress = (p: { phase: string; current: number; total: number; currentFile: string }) =>
      setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`)
    try {
      let r = await api.lan.syncDevice(url, onProgress)
      if ('needsPair' in r) { setLanMsg('尚未连接该设备,请先点“连接”'); return }
      if ('needsConfirm' in r) {
        const ok = confirm(`对方是不同的书房「${r.peerName}」,当前是「${r.localName}」。继续会把两个书房合并,通常你不想这样。确定继续吗?`)
        if (!ok) { setLanMsg('已取消'); return }
        setLanMsg('合并中…')
        const r2 = await api.lan.syncDevice(url, onProgress, true)
        if ('needsConfirm' in r2 || 'needsPair' in r2) { setLanMsg('已取消'); return }
        showSyncResult(r2); await loadPaired(); return
      }
      showSyncResult(r); await loadPaired()
    } catch (e: any) {
      setLanMsg(`同步失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }
```

- [ ] **Step 2: Remove the old `connectPeer`**

Delete the entire `connectPeer` function (it referenced the removed `api.lan.connectAndSync`). The manual-entry block in the JSX will be rewired in Step 4 to use `connectNearby`/`syncWith`.

- [ ] **Step 3: Replace the "连接附近设备" block with a scan list (keep a manual fallback)**

In the JSX, replace the "连接附近设备(本机作为 client)" block (the one with the URL+PIN inputs and the old "连接并同步" button) with:

```tsx
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={labelStyle}>附近的共享</div>
            <button onClick={scanNearby} disabled={scanning || lanBusy}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer' }}>
              {scanning ? '扫描中…' : '扫描'}
            </button>
          </div>
          {nearby.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-mute, #8A8377)' }}>{scanning ? '正在查找…' : '附近没有发现共享的设备(可在下方手动输入地址)'}</div>
          ) : (
            nearby.map(s => (
              <div key={s.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--paper-edge, #eee)' }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--ink, #2A2722)' }}>{s.deviceName || s.url}</span>
                  <span style={{ color: 'var(--ink-mute, #8A8377)' }}> · {s.libraryName}</span>
                </div>
                {pairedIds.has(s.deviceId) ? (
                  <button onClick={() => syncWith(s.url)} disabled={lanBusy}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer' }}>同步</button>
                ) : (
                  <button onClick={() => connectNearby(s.url)} disabled={lanBusy}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2f6fd8', color: '#fff', cursor: 'pointer' }}>连接</button>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>手动连接(发现不到时)</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...inputStyle, flex: 1 }} type="text" placeholder="http://192.168.x.x:端口"
              value={peerUrl} onChange={(e) => setPeerUrl(e.target.value)} disabled={lanBusy} />
            <input style={{ ...inputStyle, width: 100, flex: 'none' }} type="text" inputMode="numeric" placeholder="6 位 PIN"
              value={peerPin} onChange={(e) => setPeerPin(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={lanBusy} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={() => peerUrl && connectNearby(peerUrl)} disabled={lanBusy}
              style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2f6fd8', color: '#fff', cursor: 'pointer' }}>连接</button>
            <button onClick={() => peerUrl && syncWith(peerUrl)} disabled={lanBusy}
              style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer' }}>同步</button>
          </div>
          {lanMsg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-mute, #666)' }}>{lanMsg}</div>}
        </div>
```

(The PIN input is shared by both the scan-list "连接" and the manual "连接". The "PIN" is what the host window shows under 开启共享. The "已连接设备" list below — with 断开 — stays as-is.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: PASS (clean). All `syncDevice` union arms (`needsPair`/`needsConfirm`/result) are handled.

- [ ] **Step 5: Manual verification (rebuild core first)**

1. `pnpm --filter @banjuan/core build && pnpm --filter @banjuan/platform-node build`; restart `pnpm dev`.
2. Window A (book-room A) → 开启共享 (note the PIN). Window B → 扫描 → A appears as "设备名 · A". With B's PIN field holding A's PIN → 连接 → "已连接". Then 同步 on that row → syncs.
3. Verify "连接" and "同步" are distinct: 连接 alone does not transfer (doc counts unchanged until 同步).
4. Different non-empty room → 同步 → strong confirm dialog. Empty room → adopts + syncs.
5. 断开 in 已连接设备 → row in scan list reverts to "连接".

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/src/components/sync/SyncConfigPanel.tsx
git commit -m "feat(sync): nearby-share scan list + connect/sync split UI"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- `DiscoveryService` advertise/scan + `parseNearbyService` → Task 1. ✓
- Advertise on host start, stop on host stop/quit → Task 2. ✓
- `lan:scanNearby` → Task 2. ✓
- `lan:pairDevice` (no data movement) + `lan:syncDevice` (guard at sync time, needsPair when unpaired) → Task 3. ✓
- Remove `connectAndSync` → Tasks 3 (handler), 4 (preload/api), 5 (UI). ✓
- UI: scan list with 连接(unpaired)/同步(paired), manual fallback, paired list retained → Task 5. ✓
- Book-room merge guard moved to sync time → Task 3. ✓

**Type consistency:** `NearbyShare` shape `{deviceId, deviceName, libraryName, libraryId, url}` identical across discovery-service.ts (Task 1), api.ts scanNearby (Task 4), and the UI `nearby` state (Task 5). `pairDevice → {ok, deviceName, libraryName}` matches Task 3 ↔ Task 4. `syncDevice` union (`result | needsConfirm | needsPair`) matches Task 3 (ipc) ↔ Task 4 (api) ↔ Task 5 (UI narrowing). `discovery.advertise(AdvertiseOptions)` matches Task 1 ↔ Task 2. `getDeviceIdentity` reused (Task 2).

**Placeholder scan:** none — concrete code + commands throughout.

**Note:** `connectAndSync` is fully removed (handler/preload/api/UI). The book-room guard now runs only in `syncDevice`; pairing is pure trust establishment. Mobile (Spec B) will reuse `scanNearby`/`pairDevice`/`syncDevice` shapes via a Capacitor-side implementation.
