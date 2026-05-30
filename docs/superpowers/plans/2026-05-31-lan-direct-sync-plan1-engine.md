# LAN Direct Sync — Plan 1: Core Engine (Desktop ↔ Desktop, manual pairing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two desktop instances on the same Wi-Fi sync bidirectionally over LAN — one runs an embedded WebDAV-subset HTTP server, the other connects with manual IP + 6-digit PIN — with zero changes to the existing sync pipeline.

**Architecture:** A pure, testable request handler (`handleDavRequest`) implements the 5 WebDAV verbs (PROPFIND/GET/PUT/DELETE/MKCOL) plus a pairing endpoint, over an injected `PlatformFS`. A thin Node `http` server (`LanHostServer`) wraps it with lifecycle, port selection, and LAN-IP detection. The **client side reuses the existing `WebDAVAdapter` + `SyncService` unchanged** by authenticating via HTTP Basic where the password is the session token. mDNS auto-discovery and the mobile client are deliberately deferred to Plans 2 and 3.

**Tech Stack:** TypeScript, Node `http`/`os`/`crypto`, existing `@banjuan/core` (`SyncService`, `WebDAVAdapter`, `PlatformFS`), Vitest, Electron IPC, React (renderer).

**Spec:** `docs/superpowers/specs/2026-05-31-lan-direct-sync-design.md`

**Scope note — what is NOT in this plan (becomes Plan 2 / Plan 3):**
- mDNS/Bonjour auto-discovery (Plan 2). Plan 1 uses manual IP:port entry.
- Mobile (Capacitor) client + iOS local-network permission + QR scanning (Plan 3).
- Self-signed TLS (later enhancement). Plan 1 is plaintext HTTP on LAN.

At the end of Plan 1 you can sync two Macs (or Mac↔Windows) by typing the host's IP and PIN. That validates the riskiest assumption: the minimal server drives the real `webdav` client unchanged.

---

## File Structure

**Create:**
- `packages/core/src/sync/exclusions.ts` — shared exclusion sets (extracted from `service.ts`).
- `packages/core/src/sync/lan-pairing.ts` — PIN/token generation + verification (pure).
- `packages/core/src/sync/lan-pairing.test.ts` — unit tests.
- `packages/core/src/sync/lan-host-handler.ts` — pure WebDAV-subset request handler.
- `packages/core/src/sync/lan-host-handler.test.ts` — unit tests.
- `packages/core/src/sync/lan-sync.integration.test.ts` — real `webdav` client + `SyncService` ↔ handler-backed Node server, bidirectional.
- `packages/app/src/main/lan-host-server.ts` — Node `http` server: lifecycle, port, LAN IP, holds token+PIN.

**Modify:**
- `packages/core/src/sync/service.ts` — import exclusion sets from `exclusions.ts` (remove local copies).
- `packages/core/src/sync/index.ts` — export new symbols.
- `packages/core/src/index.ts` — re-export new symbols from barrel.
- `packages/app/src/main/ipc.ts` — add `lan:*` handlers.
- `packages/app/src/preload/index.ts` — add `lan` namespace.
- `packages/shared-ui/src/api.ts` — add `lan` API types.
- `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx` — add "局域网直连" section (host toggle + manual connect).

---

## Task 1: Extract shared exclusion rules (DRY prerequisite)

The host's directory listing MUST hide the same files the sync pipeline excludes (`db.sqlite`, `plugins/`, etc.), otherwise a client would try to download the host's SQLite cache. Extract the sets so handler and service share one source of truth.

**Files:**
- Create: `packages/core/src/sync/exclusions.ts`
- Modify: `packages/core/src/sync/service.ts:28-42`

- [ ] **Step 1: Create the shared module**

Create `packages/core/src/sync/exclusions.ts`:

```typescript
// File names never synced or served (per-device cache / OS cruft).
export const EXCLUDED_NAMES = new Set([
  'db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm',
  'library.db', 'db.meta.json',
  'sync-snapshot.json', '.DS_Store',
])

// Directory names never synced or served.
export const EXCLUDED_DIRS = new Set([
  'plugins',
])

// Files that must never be auto-deleted during sync (deletion-tracking only).
export const PROTECTED_FILES = new Set([
  '.banjuan/config.json',
  '.banjuan/tags.json',
  '.banjuan/sync.json',
])

export function isExcluded(name: string, isDirectory: boolean): boolean {
  if (EXCLUDED_NAMES.has(name)) return true
  if (isDirectory && EXCLUDED_DIRS.has(name)) return true
  return false
}
```

- [ ] **Step 2: Point `service.ts` at the shared module**

In `packages/core/src/sync/service.ts`, delete the local `EXCLUDED_NAMES`, `PROTECTED_FILES`, `EXCLUDED_DIRS` consts (lines 28-42) and replace the `import` block additions. After the existing imports (line 5 area) add:

```typescript
import { EXCLUDED_NAMES, EXCLUDED_DIRS, PROTECTED_FILES, isExcluded } from './exclusions.js'
```

Then replace the body of `shouldExclude` (lines 186-190) with:

```typescript
  private shouldExclude(name: string, isDirectory: boolean): boolean {
    return isExcluded(name, isDirectory)
  }
```

(`EXCLUDED_NAMES`/`PROTECTED_FILES` are still referenced elsewhere in `service.ts`; the new `import` keeps them in scope.)

- [ ] **Step 3: Typecheck core**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit`
Expected: PASS (no errors about missing `EXCLUDED_NAMES`/`PROTECTED_FILES`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/sync/exclusions.ts packages/core/src/sync/service.ts
git commit -m "refactor(sync): extract shared exclusion rules to exclusions.ts"
```

---

## Task 2: Pairing helpers (PIN + token)

Pure functions: generate a 6-digit PIN + a random hex token on the host; verify a client-supplied Basic-auth password against the token. No I/O, fully unit-testable. Randomness is injected so tests are deterministic.

**Files:**
- Create: `packages/core/src/sync/lan-pairing.ts`
- Test: `packages/core/src/sync/lan-pairing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/sync/lan-pairing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generatePairing, verifyToken, parseBasicAuthPassword } from './lan-pairing.js'

describe('lan-pairing', () => {
  it('generates a 6-digit PIN and a hex token from injected randomness', () => {
    // randomBytes returns predictable bytes for the test
    const rand = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i + 1))
    const { pin, token } = generatePairing(rand)
    expect(pin).toMatch(/^\d{6}$/)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
  })

  it('verifyToken is constant-shape equality', () => {
    expect(verifyToken('abc', 'abc')).toBe(true)
    expect(verifyToken('abc', 'abd')).toBe(false)
    expect(verifyToken('abc', '')).toBe(false)
  })

  it('parses the password out of a Basic auth header', () => {
    const header = 'Basic ' + Buffer.from('banjuan:tok123').toString('base64')
    expect(parseBasicAuthPassword(header)).toBe('tok123')
    expect(parseBasicAuthPassword('Bearer x')).toBeNull()
    expect(parseBasicAuthPassword(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-pairing.test.ts`
Expected: FAIL ("Cannot find module './lan-pairing.js'").

- [ ] **Step 3: Implement**

Create `packages/core/src/sync/lan-pairing.ts`:

```typescript
export interface Pairing {
  pin: string      // 6-digit string shown on the host
  token: string    // 32-char hex; the shared secret used as Basic-auth password
}

export type RandomBytes = (n: number) => Uint8Array

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** Generate a fresh PIN + token. `rand` is injected so callers/tests control entropy. */
export function generatePairing(rand: RandomBytes): Pairing {
  const tokenBytes = rand(16)              // 16 bytes -> 32 hex chars
  const pinBytes = rand(3)                 // 3 bytes -> derive 6 digits
  const pinNum = ((pinBytes[0] << 16) | (pinBytes[1] << 8) | pinBytes[2]) % 1000000
  const pin = pinNum.toString().padStart(6, '0')
  return { pin, token: toHex(tokenBytes) }
}

/** Whether a client-supplied token matches the host token. */
export function verifyToken(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false
  if (expected.length !== supplied.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i)
  return diff === 0
}

function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf-8')
  return atob(b64)
}

/** Extract the password from an `Authorization: Basic <base64(user:pass)>` header. */
export function parseBasicAuthPassword(header: string | undefined): string | null {
  if (!header || !header.startsWith('Basic ')) return null
  try {
    const decoded = decodeBase64(header.slice('Basic '.length).trim())
    const idx = decoded.indexOf(':')
    return idx === -1 ? '' : decoded.slice(idx + 1)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-pairing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/lan-pairing.ts packages/core/src/sync/lan-pairing.test.ts
git commit -m "feat(sync): add LAN pairing helpers (PIN/token gen + Basic-auth parse)"
```

---

## Task 3: LAN host request handler

Pure async function mapping an HTTP request to a response over `PlatformFS`. Implements the pairing endpoint (no auth), Basic-auth gating, the 5 WebDAV verbs, exclusion filtering, and path-traversal protection.

**Files:**
- Create: `packages/core/src/sync/lan-host-handler.ts`
- Test: `packages/core/src/sync/lan-host-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/sync/lan-host-handler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { handleDavRequest, type DavContext } from './lan-host-handler.js'

function basic(token: string): string {
  return 'Basic ' + Buffer.from('banjuan:' + token).toString('base64')
}

describe('lan-host-handler', () => {
  let root: string
  let ctx: DavContext

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lanhost-'))
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    writeFileSync(join(root, 'book.pdf'), 'PDF-DATA')
    writeFileSync(join(root, 'db.sqlite'), 'SHOULD-BE-HIDDEN')
    ctx = { rootPath: root, fs: new NodeFS(), token: 'secrettoken', pin: '123456' }
  })

  it('pairing endpoint returns token for correct PIN, 403 otherwise (no auth needed)', async () => {
    const ok = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456' } }, ctx)
    expect(ok.status).toBe(200)
    expect(JSON.parse(String(ok.body)).token).toBe('secrettoken')

    const bad = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '000000' } }, ctx)
    expect(bad.status).toBe(403)
  })

  it('rejects unauthenticated WebDAV requests with 401', async () => {
    const res = await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: {} }, ctx)
    expect(res.status).toBe(401)
    expect(res.headers['WWW-Authenticate']).toContain('Basic')
  })

  it('GET returns file bytes with content-length when authed', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/book.pdf', headers: { authorization: basic('secrettoken') } }, ctx)
    expect(res.status).toBe(200)
    expect(Buffer.from(res.body as Uint8Array).toString()).toBe('PDF-DATA')
    expect(res.headers['Content-Length']).toBe('8')
  })

  it('PROPFIND Depth:1 lists files but hides excluded names', async () => {
    const res = await handleDavRequest(
      { method: 'PROPFIND', path: '/', headers: { authorization: basic('secrettoken'), depth: '1' } }, ctx)
    expect(res.status).toBe(207)
    const xml = String(res.body)
    expect(xml).toContain('book.pdf')
    expect(xml).not.toContain('db.sqlite')   // excluded
  })

  it('PUT writes a file, MKCOL makes a dir, DELETE removes', async () => {
    const auth = { authorization: basic('secrettoken') }
    const mk = await handleDavRequest({ method: 'MKCOL', path: '/sub', headers: auth }, ctx)
    expect([201, 405]).toContain(mk.status)
    const put = await handleDavRequest(
      { method: 'PUT', path: '/sub/note.md', headers: auth, body: new TextEncoder().encode('hi') }, ctx)
    expect(put.status).toBe(201)
    const get = await handleDavRequest({ method: 'GET', path: '/sub/note.md', headers: auth }, ctx)
    expect(Buffer.from(get.body as Uint8Array).toString()).toBe('hi')
    const del = await handleDavRequest({ method: 'DELETE', path: '/sub/note.md', headers: auth }, ctx)
    expect(del.status).toBe(204)
    const gone = await handleDavRequest({ method: 'GET', path: '/sub/note.md', headers: auth }, ctx)
    expect(gone.status).toBe(404)
  })

  it('blocks path traversal', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/../../etc/passwd', headers: { authorization: basic('secrettoken') } }, ctx)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: FAIL ("Cannot find module './lan-host-handler.js'").

- [ ] **Step 3: Implement the handler**

Create `packages/core/src/sync/lan-host-handler.ts`:

```typescript
import type { PlatformFS } from '../platform/index.js'
import { join, dirname } from '../platform/path.js'
import { isExcluded } from './exclusions.js'
import { parseBasicAuthPassword, verifyToken } from './lan-pairing.js'

export interface DavRequest {
  method: string
  path: string                          // URL pathname, already decoded, e.g. "/sub/file.pdf"
  headers: Record<string, string>       // lowercased keys
  query?: Record<string, string>
  body?: Uint8Array
}

export interface DavResponse {
  status: number
  headers: Record<string, string>
  body?: Uint8Array | string
}

export interface DavContext {
  rootPath: string
  fs: PlatformFS
  token: string
  pin: string
  pairPath?: string                     // default '/.banjuan-pair'
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function encodeHref(path: string): string {
  return path.split('/').map(seg => seg === '' ? '' : encodeURIComponent(seg)).join('/')
}

/** Resolve a request path to an absolute fs path, or null if it escapes rootPath. */
function resolveSafe(rootPath: string, reqPath: string): string | null {
  const rel = decodeURIComponent(reqPath).replace(/^\/+/, '')
  if (rel.split('/').some(seg => seg === '..')) return null
  const abs = rel === '' ? rootPath : join(rootPath, rel)
  return abs
}

function unauthorized(): DavResponse {
  return { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="banjuan"' }, body: 'Unauthorized' }
}

export async function handleDavRequest(req: DavRequest, ctx: DavContext): Promise<DavResponse> {
  const pairPath = ctx.pairPath ?? '/.banjuan-pair'
  const method = req.method.toUpperCase()

  // --- Pairing endpoint (no auth): GET /.banjuan-pair?pin=NNNNNN -> { token } ---
  if (method === 'GET' && req.path === pairPath) {
    const pin = req.query?.pin ?? ''
    if (pin === ctx.pin) {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ctx.token }) }
    }
    return { status: 403, headers: {}, body: 'Bad PIN' }
  }

  if (method === 'OPTIONS') {
    return { status: 200, headers: { 'DAV': '1', 'Allow': 'OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL' } }
  }

  // --- All other routes require Basic auth where password === token ---
  const supplied = parseBasicAuthPassword(req.headers['authorization'])
  if (supplied === null || !verifyToken(ctx.token, supplied)) return unauthorized()

  const abs = resolveSafe(ctx.rootPath, req.path)
  if (abs === null) return { status: 403, headers: {}, body: 'Forbidden' }

  const fs = ctx.fs

  switch (method) {
    case 'GET': {
      if (!(await fs.exists(abs))) return { status: 404, headers: {}, body: 'Not Found' }
      const stat = await fs.stat(abs)
      const data = await fs.readFile(abs)
      return { status: 200, headers: { 'Content-Length': String(stat.size), 'Content-Type': 'application/octet-stream' }, body: data }
    }
    case 'PUT': {
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, req.body ?? new Uint8Array())
      return { status: 201, headers: {} }
    }
    case 'DELETE': {
      if (await fs.exists(abs)) await fs.remove(abs)
      return { status: 204, headers: {} }
    }
    case 'MKCOL': {
      if (await fs.exists(abs)) return { status: 405, headers: {}, body: 'Exists' }
      await fs.mkdir(abs, { recursive: true })
      return { status: 201, headers: {} }
    }
    case 'PROPFIND': {
      const depth = req.headers['depth'] ?? '1'
      return propfind(req.path, abs, depth, ctx)
    }
    default:
      return { status: 405, headers: {}, body: 'Method Not Allowed' }
  }
}

async function propfind(reqPath: string, abs: string, depth: string, ctx: DavContext): Promise<DavResponse> {
  const fs = ctx.fs
  if (!(await fs.exists(abs))) return { status: 404, headers: {}, body: 'Not Found' }

  const basePath = reqPath.endsWith('/') ? reqPath : reqPath + '/'
  const responses: string[] = []

  // Determine whether the target itself is a directory by listing its parent or trying readdir.
  let selfIsDir = false
  let selfMtime = 0
  let selfSize = 0
  try {
    // readdirWithTypes throws on a file; use that to discriminate, then stat for metadata.
    await fs.readdirWithTypes(abs)
    selfIsDir = true
  } catch {
    selfIsDir = false
  }
  try {
    const st = await fs.stat(abs)
    selfMtime = st.mtime
    selfSize = st.size
  } catch { /* keep zeros */ }

  // Self entry
  responses.push(entryXml(selfIsDir ? basePath : reqPath, selfIsDir, selfMtime, selfSize))

  // Children (Depth: 1 only, and only for directories)
  if (selfIsDir && depth !== '0') {
    let entries: Array<{ name: string; isDirectory: boolean }> = []
    try { entries = await fs.readdirWithTypes(abs) } catch { entries = [] }
    for (const e of entries) {
      if (isExcluded(e.name, e.isDirectory)) continue
      const childAbs = join(abs, e.name)
      let mtime = 0, size = 0
      try { const st = await fs.stat(childAbs); mtime = st.mtime; size = st.size } catch { /* skip */ }
      const childHref = basePath + e.name + (e.isDirectory ? '/' : '')
      responses.push(entryXml(childHref, e.isDirectory, mtime, size))
    }
  }

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<d:multistatus xmlns:d="DAV:">\n${responses.join('\n')}\n</d:multistatus>`
  return { status: 207, headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml }
}

function entryXml(href: string, isDir: boolean, mtime: number, size: number): string {
  const lastmod = new Date(mtime || 0).toUTCString()
  const resourcetype = isDir ? '<d:collection/>' : ''
  return (
    `  <d:response>\n` +
    `    <d:href>${xmlEscape(encodeHref(href))}</d:href>\n` +
    `    <d:propstat>\n` +
    `      <d:prop>\n` +
    `        <d:resourcetype>${resourcetype}</d:resourcetype>\n` +
    `        <d:getlastmodified>${lastmod}</d:getlastmodified>\n` +
    `        <d:getcontentlength>${size}</d:getcontentlength>\n` +
    `      </d:prop>\n` +
    `      <d:status>HTTP/1.1 200 OK</d:status>\n` +
    `    </d:propstat>\n` +
    `  </d:response>`
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-host-handler.test.ts`
Expected: PASS (6 tests). If `@banjuan/platform-node` import fails in the core test, fall back to importing `NodeFS` via relative path `../../../platform-node/src/index.js` — but prefer the package import; both packages are in the workspace.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/lan-host-handler.ts packages/core/src/sync/lan-host-handler.test.ts
git commit -m "feat(sync): add LAN host request handler (WebDAV-subset + pairing + auth)"
```

---

## Task 4: Integration test — real `webdav` client + `SyncService` ↔ handler

This is the critical validation: prove the existing `WebDAVAdapter` (which uses the `webdav` npm client) and `SyncService` drive our minimal server unchanged, syncing in **both directions**. The test spins a real Node `http` server around `handleDavRequest`.

**Files:**
- Test: `packages/core/src/sync/lan-sync.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/core/src/sync/lan-sync.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { WebDAVAdapter, SyncService } from '../index.js'
import { handleDavRequest, type DavContext } from './lan-host-handler.js'

const TOKEN = 'integtoken'

function startServer(ctx: DavContext): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', async () => {
      const u = new URL(req.url || '/', 'http://localhost')
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '')
      const query: Record<string, string> = {}
      u.searchParams.forEach((v, k) => { query[k] = v })
      const body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined
      const out = await handleDavRequest(
        { method: req.method || 'GET', path: decodeURIComponent(u.pathname), headers, query, body }, ctx)
      res.statusCode = out.status
      for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
      if (out.body == null) res.end()
      else if (typeof out.body === 'string') res.end(out.body)
      else res.end(Buffer.from(out.body))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ server, port })
    })
  })
}

describe('LAN sync integration (webdav client ↔ handler)', () => {
  let hostRoot: string
  let clientRoot: string
  let server: Server
  let port: number

  beforeEach(async () => {
    hostRoot = mkdtempSync(join(tmpdir(), 'lan-host-'))
    clientRoot = mkdtempSync(join(tmpdir(), 'lan-client-'))
    mkdirSync(join(hostRoot, '.banjuan'), { recursive: true })
    mkdirSync(join(clientRoot, '.banjuan'), { recursive: true })
    const ctx: DavContext = { rootPath: hostRoot, fs: new NodeFS(), token: TOKEN, pin: '111111' }
    const started = await startServer(ctx)
    server = started.server
    port = started.port
  })

  afterEach(() => { server.close() })

  function makeSync(): SyncService {
    const adapter = new WebDAVAdapter(new NodeFS())
    // Reuse existing adapter unchanged: Basic auth, password = token.
    // connect is async; SyncService doesn't call connect, so connect here in test.
    return new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
  }

  it('downloads host-only files to client (host -> client)', async () => {
    writeFileSync(join(hostRoot, 'paper.pdf'), 'HOSTDATA')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    const result = await svc.sync()
    expect(result.errors).toEqual([])
    expect(result.downloaded).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(clientRoot, 'paper.pdf'))).toBe(true)
    expect(readFileSync(join(clientRoot, 'paper.pdf'), 'utf-8')).toBe('HOSTDATA')
  })

  it('uploads client-only files to host (client -> host)', async () => {
    writeFileSync(join(clientRoot, 'mynote.md'), 'CLIENTNOTE')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    const result = await svc.sync()
    expect(result.errors).toEqual([])
    expect(result.uploaded).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(hostRoot, 'mynote.md'))).toBe(true)
    expect(readFileSync(join(hostRoot, 'mynote.md'), 'utf-8')).toBe('CLIENTNOTE')
  })

  it('does not expose excluded files (db.sqlite stays on host only)', async () => {
    writeFileSync(join(hostRoot, 'db.sqlite'), 'CACHE')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    await svc.sync()
    expect(existsSync(join(clientRoot, 'db.sqlite'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @banjuan/core exec vitest run src/sync/lan-sync.integration.test.ts`
Expected: PASS (3 tests). This proves the `webdav` client parses our PROPFIND and round-trips GET/PUT.

> If PROPFIND parsing fails inside the `webdav` client, the most likely cause is the `<d:href>` format. The `webdav` lib expects hrefs to be server-absolute paths (leading `/`). Our `entryXml` already emits `basePath`/`reqPath` which start with `/`. If a failure mentions "basename", verify children hrefs are `"/" + name`, not bare names.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/sync/lan-sync.integration.test.ts
git commit -m "test(sync): integration — webdav client + SyncService over LAN host handler"
```

---

## Task 5: Node `LanHostServer` (lifecycle, port, LAN IP)

A desktop-only wrapper that owns the HTTP server, generates the pairing on start, and reports the LAN URL + PIN. It mirrors the test's node wrapper but adds lifecycle and address detection.

**Files:**
- Create: `packages/app/src/main/lan-host-server.ts`

- [ ] **Step 1: Implement**

Create `packages/app/src/main/lan-host-server.ts`:

```typescript
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { handleDavRequest, generatePairing, type DavContext } from '@banjuan/core'
import type { PlatformFS } from '@banjuan/core'

export interface HostStatus {
  running: boolean
  url: string | null       // e.g. "http://192.168.1.20:51234"
  pin: string | null
  port: number | null
}

/** First non-internal IPv4 address, or 127.0.0.1 as fallback. */
function lanIPv4(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address
    }
  }
  return '127.0.0.1'
}

export class LanHostServer {
  private server: Server | null = null
  private token = ''
  private pin = ''
  private port = 0

  constructor(private rootPath: string, private fs: PlatformFS) {}

  async start(): Promise<HostStatus> {
    if (this.server) return this.status()
    const pairing = generatePairing((n) => new Uint8Array(randomBytes(n)))
    this.token = pairing.token
    this.pin = pairing.pin

    const ctx: DavContext = { rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin }

    this.server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', async () => {
        try {
          const u = new URL(req.url || '/', 'http://localhost')
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '')
          const query: Record<string, string> = {}
          u.searchParams.forEach((v, k) => { query[k] = v })
          const body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined
          const out = await handleDavRequest(
            { method: req.method || 'GET', path: decodeURIComponent(u.pathname), headers, query, body }, ctx)
          res.statusCode = out.status
          for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
          if (out.body == null) res.end()
          else if (typeof out.body === 'string') res.end(out.body)
          else res.end(Buffer.from(out.body))
        } catch (err) {
          res.statusCode = 500
          res.end(String((err as Error)?.message ?? err))
        }
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '0.0.0.0', () => resolve())
    })
    this.port = (this.server!.address() as { port: number }).port
    return this.status()
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = null
    this.token = ''
    this.pin = ''
    this.port = 0
  }

  status(): HostStatus {
    if (!this.server) return { running: false, url: null, pin: null, port: null }
    return { running: true, url: `http://${lanIPv4()}:${this.port}`, pin: this.pin, port: this.port }
  }
}
```

- [ ] **Step 2: Export the handler + pairing from `@banjuan/core`**

In `packages/core/src/sync/index.ts`, add:

```typescript
export { handleDavRequest } from './lan-host-handler.js'
export type { DavRequest, DavResponse, DavContext } from './lan-host-handler.js'
export { generatePairing, verifyToken, parseBasicAuthPassword } from './lan-pairing.js'
export type { Pairing } from './lan-pairing.js'
export { EXCLUDED_NAMES, EXCLUDED_DIRS, PROTECTED_FILES, isExcluded } from './exclusions.js'
```

In `packages/core/src/index.ts`, after the existing sync exports (line 12 area), add:

```typescript
export { handleDavRequest, generatePairing } from './sync/index.js'
export type { DavRequest, DavResponse, DavContext, Pairing } from './sync/index.js'
```

(Also confirm `PlatformFS` is exported from `@banjuan/core`; if `import type { PlatformFS } from '@banjuan/core'` errors in Step 1, change that import in `lan-host-server.ts` to the path the codebase already uses for `PlatformFS` — grep `export type { PlatformFS }` in `packages/core/src/index.ts`.)

- [ ] **Step 3: Typecheck core + app**

Run: `pnpm --filter @banjuan/core exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: core PASS; app shows ONLY pre-existing errors (WebkitAppRegion, zotero-pdfjs-dist, search:query) and none referencing `lan-host-server.ts` or the new exports.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/main/lan-host-server.ts packages/core/src/sync/index.ts packages/core/src/index.ts
git commit -m "feat(sync): add Node LanHostServer + export LAN host handler/pairing from core"
```

---

## Task 6: IPC handlers (`lan:*`)

Wire the host lifecycle and client connect-and-sync into Electron IPC, following the existing `sync:run` pattern (progress events + post-sync `rebuildFull`).

**Files:**
- Modify: `packages/app/src/main/ipc.ts` (add handlers near the `sync:*` block, ~line 880)

- [ ] **Step 1: Add a module-level host singleton + import**

At the top of `packages/app/src/main/ipc.ts`, add to the existing import area:

```typescript
import { LanHostServer, type HostStatus } from './lan-host-server.js'
```

Below the `deps` declaration (~line 20), add:

```typescript
let lanHost: LanHostServer | null = null
```

- [ ] **Step 2: Add the IPC handlers**

Insert after the `sync:getDocStatus` handler:

```typescript
  ipcMain.handle('lan:startHost', async (event): Promise<HostStatus> => {
    const library = getLib(event)
    if (lanHost) await lanHost.stop()
    lanHost = new LanHostServer(library.rootPath, deps.fs)
    return lanHost.start()
  })

  ipcMain.handle('lan:stopHost', async (): Promise<void> => {
    if (lanHost) { await lanHost.stop(); lanHost = null }
  })

  ipcMain.handle('lan:getHostStatus', async (): Promise<HostStatus> => {
    return lanHost ? lanHost.status() : { running: false, url: null, pin: null, port: null }
  })

  // Client side: exchange PIN for token at the peer, then run a full bidirectional sync.
  ipcMain.handle('lan:connectAndSync', async (event, peerUrl: string, pin: string) => {
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')

    // 1) Pair: GET {base}/.banjuan-pair?pin=NNNNNN -> { token }
    const pairResp = await fetch(`${base}/.banjuan-pair?pin=${encodeURIComponent(pin)}`)
    if (!pairResp.ok) throw new Error(`PAIR_FAILED:${pairResp.status}`)
    const { token } = await pairResp.json() as { token: string }
    if (!token) throw new Error('PAIR_FAILED:no-token')

    // 2) Reuse existing WebDAVAdapter unchanged: Basic auth, password = token.
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

- [ ] **Step 3: Typecheck app**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: only pre-existing errors; nothing referencing `lan:*` handlers.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(sync): add lan:* IPC handlers (host lifecycle + client connectAndSync)"
```

---

## Task 7: Preload + API types

Expose the `lan` namespace to the renderer, reusing the existing `sync:progress` listener pattern from `sync.run`.

**Files:**
- Modify: `packages/app/src/preload/index.ts` (after the `sync` namespace, ~line 211)
- Modify: `packages/shared-ui/src/api.ts` (after the `sync` API type, ~line 226)

- [ ] **Step 1: Add to preload**

In `packages/app/src/preload/index.ts`, after the `sync: { ... }` object, add a sibling `lan` object:

```typescript
  lan: {
    startHost: () => ipcRenderer.invoke('lan:startHost'),
    stopHost: () => ipcRenderer.invoke('lan:stopHost'),
    getHostStatus: () => ipcRenderer.invoke('lan:getHostStatus'),
    connectAndSync: (peerUrl: string, pin: string, onProgress?: (p: any) => void) => {
      const handler = onProgress ? (_e: any, p: any) => onProgress(p) : null
      if (handler) ipcRenderer.on('sync:progress', handler)
      return ipcRenderer.invoke('lan:connectAndSync', peerUrl, pin).finally(() => {
        if (handler) ipcRenderer.removeListener('sync:progress', handler)
      })
    },
  },
```

- [ ] **Step 2: Add API types**

In `packages/shared-ui/src/api.ts`, inside the API interface after the `sync` member, add:

```typescript
  lan: {
    startHost(): Promise<{ running: boolean; url: string | null; pin: string | null; port: number | null }>
    stopHost(): Promise<void>
    getHostStatus(): Promise<{ running: boolean; url: string | null; pin: string | null; port: number | null }>
    connectAndSync(
      peerUrl: string,
      pin: string,
      onProgress?: (p: { phase: string; current: number; total: number; currentFile: string }) => void,
    ): Promise<{ uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; stubbed: number; errors: string[] }>
  }
```

- [ ] **Step 3: Typecheck shared-ui + app**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit && pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: shared-ui PASS; app only pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/preload/index.ts packages/shared-ui/src/api.ts
git commit -m "feat(sync): expose lan namespace via preload + api types"
```

---

## Task 8: Desktop UI — "局域网直连" section

Add a section to the sync panel with two halves: **开启共享** (start host → show LAN URL + PIN) and **连接附近设备** (manual peer URL + PIN → sync with progress). Reuses the panel's existing progress rendering conventions.

**Files:**
- Modify: `packages/shared-ui/src/components/sync/SyncConfigPanel.tsx`

- [ ] **Step 1: Add state + handlers**

Near the top of the `SyncConfigPanel` component body (with the other `useState` hooks), add:

```tsx
  const [hostStatus, setHostStatus] = useState<{ running: boolean; url: string | null; pin: string | null }>({ running: false, url: null, pin: null })
  const [peerUrl, setPeerUrl] = useState('')
  const [peerPin, setPeerPin] = useState('')
  const [lanBusy, setLanBusy] = useState(false)
  const [lanMsg, setLanMsg] = useState('')

  const toggleHost = async () => {
    setLanBusy(true)
    try {
      if (hostStatus.running) {
        await api.lan.stopHost()
        setHostStatus({ running: false, url: null, pin: null })
      } else {
        const s = await api.lan.startHost()
        setHostStatus({ running: s.running, url: s.url, pin: s.pin })
      }
    } finally {
      setLanBusy(false)
    }
  }

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

- [ ] **Step 2: Add the UI block**

Inside the panel's returned JSX, after the existing WebDAV "Sync Now" section, add:

```tsx
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee' }}>
        <h3 style={{ margin: '0 0 8px' }}>局域网直连(同一 Wi-Fi)</h3>

        <div style={{ marginBottom: 16 }}>
          <button onClick={toggleHost} disabled={lanBusy}>
            {hostStatus.running ? '停止共享' : '开启共享(本机作为 host)'}
          </button>
          {hostStatus.running && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <div>对方在另一台设备填入地址:<code>{hostStatus.url}</code></div>
              <div>配对 PIN:<strong style={{ fontSize: 18, letterSpacing: 2 }}>{hostStatus.pin}</strong></div>
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>连接附近设备(本机作为 client):</div>
          <input
            placeholder="http://192.168.x.x:端口"
            value={peerUrl}
            onChange={(e) => setPeerUrl(e.target.value)}
            style={{ width: 220, marginRight: 8 }}
          />
          <input
            placeholder="6 位 PIN"
            value={peerPin}
            onChange={(e) => setPeerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ width: 90, marginRight: 8 }}
          />
          <button onClick={connectPeer} disabled={lanBusy}>连接并同步</button>
          {lanMsg && <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>{lanMsg}</div>}
        </div>
      </div>
```

(Match the surrounding code's styling idiom — if the panel uses CSS modules or styled components rather than inline styles, adapt these blocks to that convention; the logic stays identical.)

- [ ] **Step 3: Verify `api` and `useState` are in scope**

Confirm `SyncConfigPanel.tsx` already imports `useState` from `react` and receives/imports `api`. Grep: `grep -n "useState\|api" packages/shared-ui/src/components/sync/SyncConfigPanel.tsx | head`. If `api` is a prop, use the prop; if imported, keep the import.

- [ ] **Step 4: Typecheck shared-ui**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual end-to-end verification (two desktop instances)**

1. `pnpm dev` on machine A and machine B (same Wi-Fi), each open a library.
2. On A: open sync panel → "开启共享" → note the `http://A-ip:port` URL and PIN.
3. On B: paste A's URL + PIN → "连接并同步".
4. Verify: a file present only on A appears on B; a note created only on B appears on A; `db.sqlite` is NOT copied across.
5. Wrong PIN → "失败:PAIR_FAILED:403".

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/src/components/sync/SyncConfigPanel.tsx
git commit -m "feat(sync): desktop LAN direct-sync UI (host share + manual connect)"
```

---

## Self-Review (completed during planning)

**Spec coverage (Plan 1 portion):**
- Local HTTP server exposing whole library root with exclusion rules → Tasks 1, 3, 5. ✓
- Bidirectional sync reusing existing pipeline → Task 4 proves it; Task 6 wires it. ✓
- WebDAV-subset protocol (PROPFIND/GET/PUT/DELETE/MKCOL) → Task 3. ✓
- PIN + token auth, plaintext HTTP → Tasks 2, 3, 6. ✓
- Desktop can be host AND client → Tasks 5 (host) + 6 `connectAndSync` (client); UI exposes both → Task 8. ✓
- Error handling: 401/403/404, wrong PIN, traversal → Tasks 3, 6, 8. ✓
- **Deferred (other plans):** mDNS discovery (Plan 2), mobile client + iOS perms + QR (Plan 3), TLS (later). Explicitly scoped out at top.

**Type consistency:** `HostStatus` shape `{ running, url, pin, port }` is identical across `lan-host-server.ts`, IPC, preload, and api.ts. `handleDavRequest(req, ctx)` signature and `DavContext` fields match between handler, tests, and server. `connectAndSync(peerUrl, pin, onProgress?)` matches across IPC/preload/api/UI. Pairing endpoint path `/.banjuan-pair` and query key `pin` match between handler (Task 3), integration test (Task 4), and client (Task 6).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands include expected output.
