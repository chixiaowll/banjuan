# Mobile (iPad) LAN Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the iPad/iPhone (Capacitor) app discover a desktop host over mDNS, pair once, and sync — reusing `@banjuan/core` in the renderer; mobile is client-only.

**Architecture:** Mobile runs `Library`/`SyncService` in the WKWebView with `CapacitorFS`, so the `lan` namespace is implemented in `packages/mobile/src/capacitor-api.ts` (mirroring the desktop IPC handlers) using `CapacitorHttp` for `/.banjuan-info` + `/.banjuan-pair`, `PairingStore` for trust, and `CapacitorWebDAVAdapter` + `SyncService` for transfer. Discovery uses a Capacitor zeroconf plugin (browse only). The `parseNearbyService` mapping is extracted to core and shared with desktop.

**Tech Stack:** TypeScript, Capacitor 6 (`@capacitor/preferences`, `@capacitor/device`, `CapacitorHttp`, a zeroconf plugin), `@banjuan/core` (`PairingStore`, `SyncService`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-mobile-lan-client-design.md`

**Device-test caveat:** Tasks 4–6 (zeroconf plugin, iOS plist, mobile api/UI) cannot be fully verified on the dev Mac — they are typecheck-gated + require an iPad/simulator build for real verification. Task 1 is fully unit-tested; Tasks 2–3 are typecheck + small.

---

## File Structure

**Create:**
- `packages/core/src/sync/discovery.ts` — platform-neutral `parseDiscoveredService` + `NearbyShare` type (extracted from desktop).
- `packages/core/src/sync/discovery.test.ts` — unit tests (moved from app).
- `packages/mobile/src/capacitor-device-identity.ts` — per-install device id via Preferences.
- `packages/mobile/src/capacitor-mdns.ts` — zeroconf browse → NearbyShare[].

**Modify:**
- `packages/core/src/sync/index.ts` + `packages/core/src/index.ts` — export discovery helper/type.
- `packages/app/src/main/discovery-service.ts` — import `parseDiscoveredService`/`NearbyShare` from core (drop the local copy).
- `packages/mobile/src/capacitor-webdav-adapter.ts` — `upload` accepts `mtimeMs`, sends `X-Banjuan-Mtime`.
- `packages/mobile/src/capacitor-api.ts` — add the `lan` namespace.
- `packages/mobile/package.json` — add `@capacitor/preferences`, `@capacitor/device`, zeroconf plugin.
- `packages/mobile/ios/App/App/Info.plist` — add `_banjuan-sync._tcp` to `NSBonjourServices`.
- `packages/shared-ui/src/api.ts` — `lan.canHost?: boolean`.
- `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx` — hide host block when `canHost === false`.
- `packages/app/src/preload/index.ts` — `lan.canHost = true` (desktop can host).

---

## Task 1: Extract `parseDiscoveredService` + `NearbyShare` to core (share with desktop)

**Files:**
- Create: `packages/core/src/sync/discovery.ts`
- Test: `packages/core/src/sync/discovery.test.ts`
- Modify: `packages/core/src/sync/index.ts`, `packages/core/src/index.ts`, `packages/app/src/main/discovery-service.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/sync/discovery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDiscoveredService } from './discovery.js'

describe('parseDiscoveredService', () => {
  it('maps a service (lowercase txt + IPv4) to a NearbyShare', () => {
    expect(parseDiscoveredService({
      port: 51234,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { deviceid: 'DEV1', devicename: 'Mac', libraryid: 'LIB1', libraryname: 'My Room' },
    })).toEqual({
      deviceId: 'DEV1', deviceName: 'Mac', libraryName: 'My Room', libraryId: 'LIB1',
      url: 'http://192.168.1.20:51234',
    })
  })
  it('returns null without a deviceId', () => {
    expect(parseDiscoveredService({ port: 1, addresses: ['192.168.1.5'], txt: {} })).toBeNull()
  })
  it('returns null without an IPv4 address', () => {
    expect(parseDiscoveredService({ port: 1, addresses: ['fe80::1'], txt: { deviceid: 'X' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/discovery.test.ts`
Expected: FAIL — `Cannot find module './discovery.js'`.

- [ ] **Step 3: Implement the core helper**

Create `packages/core/src/sync/discovery.ts`:

```typescript
export interface NearbyShare {
  deviceId: string
  deviceName: string
  libraryName: string
  libraryId: string
  url: string                          // e.g. "http://192.168.1.20:51234"
}

// Minimal shape of a discovered mDNS service (bonjour-service or a Capacitor
// zeroconf plugin both normalize to this).
export interface DiscoveredService {
  port?: number
  addresses?: string[]
  txt?: Record<string, unknown>
}

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** Map a discovered mDNS service to a NearbyShare, or null if unusable. */
export function parseDiscoveredService(svc: DiscoveredService): NearbyShare | null {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/discovery.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from barrels**

In `packages/core/src/sync/index.ts` append:
```typescript
export { parseDiscoveredService } from './discovery.js'
export type { NearbyShare, DiscoveredService } from './discovery.js'
```
In `packages/core/src/index.ts` (after the other sync re-exports) append:
```typescript
export { parseDiscoveredService } from './sync/index.js'
export type { NearbyShare, DiscoveredService } from './sync/index.js'
```

- [ ] **Step 6: Point the desktop DiscoveryService at the core helper**

In `packages/app/src/main/discovery-service.ts`: remove the local `NearbyShare` interface, the `BonjourServiceLike` interface, the `IPV4` const, and the `parseNearbyService` function. Add an import at the top:
```typescript
import { parseDiscoveredService, type NearbyShare } from '@banjuan/core'
```
Replace the one call site inside `scan()` — `const n = parseNearbyService(svc as BonjourServiceLike)` — with:
```typescript
        const n = parseDiscoveredService(svc as { port?: number; addresses?: string[]; txt?: Record<string, unknown> })
```
Keep `AdvertiseOptions`, `SERVICE_TYPE`, and the `DiscoveryService` class. The `advertise`/`scan`/`stopAdvertise`/`destroy` methods stay; only the parse helper moved.

Then delete the now-obsolete `packages/app/src/main/discovery-service.test.ts` (its `parseNearbyService` test moved to core):
```bash
git rm packages/app/src/main/discovery-service.test.ts
```

- [ ] **Step 7: Typecheck both packages**

Run: `pnpm --filter @banjuan/core build && pnpm --filter @banjuan/core exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: core clean; app only pre-existing errors (SearchOptions, WelcomeView WebkitAppRegion ×2, zotero-pdfjs-dist ×4); nothing referencing the removed `parseNearbyService`.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/sync/discovery.ts packages/core/src/sync/discovery.test.ts packages/core/src/sync/index.ts packages/core/src/index.ts packages/app/src/main/discovery-service.ts
git commit -m "refactor(sync): extract parseDiscoveredService to core (share desktop+mobile)"
```

---

## Task 2: Mobile device identity (Preferences)

**Files:**
- Create: `packages/mobile/src/capacitor-device-identity.ts`
- Modify: `packages/mobile/package.json`

- [ ] **Step 1: Add the Capacitor deps**

Run: `pnpm --filter @banjuan/mobile add @capacitor/preferences@^6.0.0 @capacitor/device@^6.0.0`
Expected: both appear under dependencies (Capacitor 6 to match the others).

- [ ] **Step 2: Implement the identity helper**

Create `packages/mobile/src/capacitor-device-identity.ts`:

```typescript
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
}

const KEY = 'banjuan.device'

/** Stable per-install identity, persisted via Capacitor Preferences. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const { value } = await Preferences.get({ key: KEY })
  if (value) {
    try {
      const d = JSON.parse(value)
      if (d && typeof d.deviceId === 'string' && d.deviceId) return d
    } catch { /* corrupt — recreate */ }
  }
  let deviceName = 'iPad'
  try {
    const info = await Device.getInfo()
    deviceName = info.name || info.model || 'iPad'
  } catch { /* default */ }
  const identity: DeviceIdentity = {
    deviceId: crypto.randomUUID().replace(/-/g, ''),
    deviceName,
  }
  await Preferences.set({ key: KEY, value: JSON.stringify(identity) })
  return identity
}
```

(`crypto.randomUUID` is available in the WKWebView. `Device.getInfo().name` is the user-set device name on iOS.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/mobile exec tsc --noEmit`
Expected: PASS (no errors referencing capacitor-device-identity.ts). If `@banjuan/mobile` has no `tsc`/build script, run `pnpm --filter @banjuan/mobile exec tsc --noEmit -p tsconfig.json`; if there's genuinely no tsconfig, report it (mobile uses vite — there should be a tsconfig.json).

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/package.json packages/mobile/src/capacitor-device-identity.ts
git commit -m "feat(mobile): per-install device identity via Capacitor Preferences"
```

---

## Task 3: `CapacitorWebDAVAdapter.upload` sends `X-Banjuan-Mtime`

**Files:**
- Modify: `packages/mobile/src/capacitor-webdav-adapter.ts`

- [ ] **Step 1: Read the current `upload`**

It is (around line 95):
```typescript
  async upload(localPath: string, remotePath: string): Promise<void> {
    ...
    const result = await FileUploader.upload({
      ...
    })
    ...
  }
```
Read the whole method to see how `FileUploader.upload` is configured (it takes a `headers` option, or the request is built with headers).

- [ ] **Step 2: Add the optional mtime param + header**

Change the signature to `async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void>` and, when `mtimeMs && mtimeMs > 0`, include `'X-Banjuan-Mtime': String(mtimeMs)` in the request headers passed to `FileUploader.upload` (merge into whatever headers object it already builds — e.g. alongside the Authorization header). If `FileUploader.upload` does not currently pass custom headers, add a `headers` field to its options containing the auth header plus the mtime header. Keep all other behavior identical.

(This mirrors the desktop `WebDAVAdapter.upload(localPath, remotePath, mtimeMs?)`. Real WebDAV/our LAN host both accept the header; the host applies it to preserve the uploaded file's mtime. Note: mobile cannot set mtime on *downloaded* files — that limitation is accepted per the spec.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/mobile exec tsc --noEmit`
Expected: PASS — `SyncService` calls `adapter.upload(localPath, remotePath, local.mtime)`; the new optional param matches the `SyncAdapter.upload` interface (already `mtimeMs?`).

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/src/capacitor-webdav-adapter.ts
git commit -m "feat(mobile): CapacitorWebDAVAdapter sends X-Banjuan-Mtime on upload"
```

---

## Task 4: Mobile zeroconf discovery (`capacitor-mdns.ts`)

**Files:**
- Modify: `packages/mobile/package.json`
- Create: `packages/mobile/src/capacitor-mdns.ts`
- Modify: `packages/mobile/ios/App/App/Info.plist`

- [ ] **Step 1: Add a Capacitor-6 zeroconf plugin**

Run: `pnpm --filter @banjuan/mobile add capacitor-zeroconf`
First verify the installed version supports Capacitor 6 (check its peerDependencies / README). If `capacitor-zeroconf` is NOT Capacitor-6-compatible, STOP and report **BLOCKED** with what you found (do not force an incompatible native plugin). The plugin must support `watch`/browse on iOS.

- [ ] **Step 2: Implement the browse wrapper**

Create `packages/mobile/src/capacitor-mdns.ts`. Adapt the plugin's `watch` API to a one-shot scan that collects services for `timeoutMs`, normalizes each to `{ port, addresses, txt }`, and maps via the core `parseDiscoveredService`:

```typescript
import { ZeroConf } from 'capacitor-zeroconf'
import { parseDiscoveredService, type NearbyShare } from '@banjuan/core'

const SERVICE_TYPE = '_banjuan-sync._tcp.'   // zeroconf plugins expect the full type with trailing dot
const DOMAIN = 'local.'

/** Browse the LAN for banjuan shares for `timeoutMs`, return a de-duped snapshot. */
export async function scanNearby(timeoutMs = 2000): Promise<NearbyShare[]> {
  const found = new Map<string, NearbyShare>()
  await ZeroConf.watch({ type: SERVICE_TYPE, domain: DOMAIN }, (result) => {
    if (result.action !== 'resolved' || !result.service) return
    const s = result.service
    const n = parseDiscoveredService({
      port: s.port,
      addresses: s.ipv4Addresses ?? s.addresses ?? [],
      // zeroconf TXT comes as a string-map; keys are case-insensitive — lowercase them.
      txt: Object.fromEntries(Object.entries(s.txtRecord ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    })
    if (n) found.set(n.deviceId, n)
  })
  await new Promise((r) => setTimeout(r, timeoutMs))
  try { await ZeroConf.unwatch({ type: SERVICE_TYPE, domain: DOMAIN }) } catch { /* ignore */ }
  try { await ZeroConf.close() } catch { /* ignore */ }
  return [...found.values()]
}
```

ADAPT the field names (`result.action`, `result.service`, `s.ipv4Addresses`, `s.txtRecord`, the `watch`/`unwatch`/`close` method names and signatures) to the ACTUAL API of the plugin you installed — read its TypeScript types. The intent is fixed: browse `_banjuan-sync._tcp` for `timeoutMs`, map resolved services via `parseDiscoveredService`, dedupe by deviceId. If the plugin's shape differs substantially, keep the same intent and report what you changed.

- [ ] **Step 3: Add the Bonjour service type to iOS Info.plist**

In `packages/mobile/ios/App/App/Info.plist`, the `NSBonjourServices` array currently contains only `<string>_http._tcp</string>`. Add our type:
```xml
	<key>NSBonjourServices</key>
	<array>
		<string>_http._tcp</string>
		<string>_banjuan-sync._tcp</string>
	</array>
```
(The `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking` keys already exist — leave them.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @banjuan/mobile exec tsc --noEmit`
Expected: PASS — `capacitor-mdns.ts` resolves the plugin types + the core import. (No automated runtime test — mDNS needs a device build. Note this in the report.)

- [ ] **Step 5: Commit**

```bash
git add packages/mobile/package.json packages/mobile/src/capacitor-mdns.ts packages/mobile/ios/App/App/Info.plist
git commit -m "feat(mobile): zeroconf browse for nearby shares + iOS Bonjour service type"
```

---

## Task 5: `api.lan` namespace on mobile (client-only)

**Files:**
- Modify: `packages/mobile/src/capacitor-api.ts`

- [ ] **Step 1: Add imports near the top**

Add:
```typescript
import { CapacitorHttp } from '@capacitor/core'
import { getDeviceIdentity } from './capacitor-device-identity'
import { scanNearby as mdnsScanNearby } from './capacitor-mdns'
```

- [ ] **Step 2: Add the `lan` namespace to the returned api object**

In `capacitor-api.ts`, the api is `return { library:{…}, …, sync:{…}, search:{…}, index:{…} }`. Add a `lan` member (e.g. right after the `sync` namespace):

```typescript
    lan: {
      canHost: false,   // mobile is client-only — UI hides the host controls
      async startHost() { return { running: false, url: null, pin: null, port: null } },
      async stopHost() { /* mobile cannot host */ },
      async getHostStatus() { return { running: false, url: null, pin: null, port: null } },

      async scanNearby() {
        return mdnsScanNearby()
      },

      async pairDevice(peerUrl: string, pin: string) {
        const base = peerUrl.replace(/\/$/, '')
        const me = await getDeviceIdentity()
        const lib = getLib()
        const myLibraryId = await lib.getId()
        const { PairingStore } = await import('@banjuan/core')

        const info = (await CapacitorHttp.get({ url: `${base}/.banjuan-info` })).data as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
        const hostDeviceId = info.deviceId ?? ''
        if (!hostDeviceId) throw new Error('PAIR_FAILED:no-device-id')

        const params = { pin, deviceId: me.deviceId, deviceName: me.deviceName, libraryId: myLibraryId }
        const pair = (await CapacitorHttp.get({ url: `${base}/.banjuan-pair`, params })).data as { token?: string }
        if (!pair.token) throw new Error('PAIR_FAILED:no-token')

        const store = new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs)
        await store.addOrUpdate({ peerDeviceId: hostDeviceId, peerDeviceName: info.deviceName ?? '', peerLibraryId: info.libraryId ?? '', token: pair.token })
        return { ok: true as const, deviceName: info.deviceName ?? '', libraryName: info.libraryName ?? '' }
      },

      async syncDevice(peerUrl: string, onProgress?: (p: any) => void, force?: boolean) {
        const base = peerUrl.replace(/\/$/, '')
        const lib = getLib()
        const myLibraryId = await lib.getId()
        const { PairingStore, SyncService } = await import('@banjuan/core')
        const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')

        const info = (await CapacitorHttp.get({ url: `${base}/.banjuan-info` })).data as { deviceId?: string; libraryId?: string; libraryName?: string }
        const hostDeviceId = info.deviceId ?? ''
        const hostLibraryId = info.libraryId ?? ''
        const hostLibraryName = info.libraryName ?? ''

        const store = new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs)
        const existing = hostDeviceId ? await store.findByDeviceId(hostDeviceId) : undefined
        if (!existing) return { needsPair: true as const }

        if (hostLibraryId && hostLibraryId !== myLibraryId) {
          const isEmpty = (await lib.documents.list()).length === 0
          if (isEmpty || force) {
            await lib.adoptLibraryId(hostLibraryId)
          } else {
            return { needsConfirm: true as const, peerName: hostLibraryName, localName: await lib.getName() }
          }
        }

        const adapter = new CapacitorWebDAVAdapter(createDeps(lib.rootPath).fs)
        await adapter.connect({ type: 'webdav', url: base, username: 'banjuan', password: existing.token, remotePath: '/' })
        const svc = new SyncService(lib.rootPath, adapter, lib.events, createDeps(lib.rootPath).fs, '/')
        const result = await svc.sync(onProgress)
        onProgress?.({ phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
        await lib.createIndexService().rebuildFull()
        return result
      },

      async listPairedDevices() {
        const lib = getLib()
        const { PairingStore } = await import('@banjuan/core')
        const devices = await new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs).list()
        return devices.map(({ token: _t, ...rest }) => rest)
      },

      async unpairDevice(peerDeviceId: string) {
        const lib = getLib()
        const { PairingStore } = await import('@banjuan/core')
        await new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs).removeByDeviceId(peerDeviceId)
      },
    },
```

ADAPT to the actual `CapacitorHttp.get` return shape (it's `{ data, status, headers }`; `params` are query params — confirm against `@capacitor/core` types; `data` may already be parsed JSON or a string needing `JSON.parse` — handle whichever the installed version returns). `createDeps(rootPath)` and `getLib()` already exist in this file.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/mobile exec tsc --noEmit`
Expected: PASS — the `lan` member now satisfies the `BanjuanAPI['lan']` type (including `canHost`, added to the type in Task 6; do Task 6's api.ts change first if tsc complains `canHost` isn't on the type, OR run Task 6 Step 1 before this typecheck).

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/src/capacitor-api.ts
git commit -m "feat(mobile): implement api.lan client (scan/pair/sync/list/unpair)"
```

---

## Task 6: `canHost` capability + hide host UI on mobile

**Files:**
- Modify: `packages/shared-ui/src/api.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`

- [ ] **Step 1: Add `canHost` to the API type**

In `packages/shared-ui/src/api.ts`, inside the `lan: { … }` member, add as the first line:
```typescript
    canHost?: boolean
```

- [ ] **Step 2: Desktop advertises `canHost: true`**

In `packages/app/src/preload/index.ts`, inside the `lan: { … }` object, add:
```typescript
    canHost: true,
```
(Mobile already sets `canHost: false` in Task 5.)

- [ ] **Step 3: Hide the host block on mobile**

In `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`, find the "开启共享(本机作为 host)" JSX block (the host toggle + the URL/PIN display when running). Wrap it in a guard so it only renders when hosting is supported. Add near the top of the component body:
```typescript
  const canHost = api.lan.canHost !== false   // undefined (older desktop) treated as can-host
```
Then wrap the host block:
```tsx
        {canHost && (
          <>
            {/* ...existing 开启共享 host toggle + status block... */}
          </>
        )}
```
Leave the "附近的共享" scan list, "手动连接", and "已连接设备" blocks always visible (mobile uses those).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit && pnpm --filter @banjuan/mobile exec tsc --noEmit`
Expected: shared-ui clean; app only pre-existing; mobile clean.

- [ ] **Step 5: Manual verification (iPad/simulator — device-gated)**

1. Build the mobile app to an iPad/simulator on the same Wi-Fi as a desktop host.
2. Desktop: 开启共享. iPad: open the sync panel → host block is HIDDEN; tap 扫描 → iOS prompts for local-network permission → the desktop share appears (设备名 · 书房名).
3. iPad: enter the desktop's PIN → 连接 → 同步 → documents arrive.
4. Different book-room → 强确认; unpair → 断开.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/src/api.ts packages/app/src/preload/index.ts packages/shared-ui/src/components/sync/SyncConfigPanel.tsx
git commit -m "feat(sync): canHost capability — hide host controls on mobile (client-only)"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Mobile device identity (Preferences + Device) → Task 2. ✓
- Mobile zeroconf discovery + iOS plist → Task 4. ✓
- api.lan on mobile (scan/pair/sync/list/unpair; host no-ops) → Task 5. ✓
- CapacitorWebDAVAdapter mtime header → Task 3. ✓
- UI hides host block on mobile (canHost) → Task 6. ✓
- Reuse parseNearbyService field shape → Task 1 (extracted to core, shared). ✓
- Client-only role; manual-entry fallback already in the shared panel from the desktop plan. ✓

**Type consistency:** `NearbyShare`/`DiscoveredService` from core (Task 1) used by desktop discovery-service.ts (Task 1) and mobile capacitor-mdns.ts (Task 4). `getDeviceIdentity(): Promise<{deviceId,deviceName}>` (Task 2) used in Task 5. `pairDevice`/`syncDevice`/`scanNearby`/`listPairedDevices`/`unpairDevice` shapes in the mobile `lan` (Task 5) match `BanjuanAPI['lan']` (api.ts — same union/returns as desktop, plus `canHost` added Task 6). `CapacitorWebDAVAdapter.upload(…, mtimeMs?)` (Task 3) matches `SyncAdapter.upload`.

**Placeholder scan:** none — concrete code throughout. The native plugin/HTTP shapes carry explicit "ADAPT to the installed plugin's actual API" instructions (the intent is fixed; field names are verified at implementation against real types), which is appropriate for third-party native APIs rather than a placeholder.

**Device-test caveat reiterated:** Tasks 4–6 are typecheck-gated on the dev Mac; real verification needs an iPad/simulator build (Task 6 Step 5). Task 1 is fully unit-tested; the desktop refactor keeps existing behavior.
