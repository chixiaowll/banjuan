import type { PlatformFS } from '../platform/index.js'
import { join, dirname } from '../platform/path.js'
import { isExcluded } from './exclusions.js'
import { parseBasicAuthPassword, verifyToken } from './lan-pairing.js'

export interface DavRequest {
  method: string
  path: string                          // URL pathname, already percent-decoded, e.g. "/sub/file.pdf"
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

/**
 * Resolve an (already percent-decoded) request path to an absolute fs path,
 * or null if it would escape rootPath or contains a null byte.
 */
function resolveSafe(rootPath: string, reqPath: string): string | null {
  const rel = reqPath.replace(/^\/+/, '')
  if (rel.includes('\x00')) return null
  if (rel.split('/').some(seg => seg === '..')) return null
  const abs = rel === '' ? rootPath : join(rootPath, rel)
  // Defense-in-depth: ensure the resolved path stays within rootPath.
  if (abs !== rootPath && !abs.startsWith(rootPath + '/')) return null
  return abs
}

function unauthorized(): DavResponse {
  return { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="banjuan"' }, body: 'Unauthorized' }
}

/** True if any segment of the (decoded) path is an excluded file or directory. */
function isExcludedPath(reqPath: string): boolean {
  const segments = reqPath.replace(/^\/+/, '').split('/').filter(Boolean)
  for (let i = 0; i < segments.length; i++) {
    const isDir = i < segments.length - 1   // only the last segment is the leaf (possibly a file)
    if (isExcluded(segments[i], isDir)) return true
  }
  return false
}

export async function handleDavRequest(req: DavRequest, ctx: DavContext): Promise<DavResponse> {
  try {
    return await routeDavRequest(req, ctx)
  } catch {
    // Never leak an unhandled rejection to the socket — fail closed with 500.
    return { status: 500, headers: {}, body: 'Internal Error' }
  }
}

async function routeDavRequest(req: DavRequest, ctx: DavContext): Promise<DavResponse> {
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

  if (isExcludedPath(req.path)) return { status: 403, headers: {}, body: 'Forbidden' }

  const fs = ctx.fs

  switch (method) {
    case 'GET': {
      if (!(await fs.exists(abs))) return { status: 404, headers: {}, body: 'Not Found' }
      const stat = await fs.stat(abs)
      const data = await fs.readFile(abs)
      return { status: 200, headers: { 'Content-Length': String(stat.size), 'Content-Type': 'application/octet-stream' }, body: data }
    }
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
    case 'DELETE': {
      // Deliberate RFC 4918 deviation: idempotent — 204 even if the target is already gone.
      if (await fs.exists(abs)) await fs.remove(abs)
      return { status: 204, headers: {} }
    }
    case 'MKCOL': {
      if (await fs.exists(abs)) return { status: 405, headers: {}, body: 'Exists' }
      // Deliberate RFC 4918 deviation: create missing parents (recursive) for sync robustness.
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

  // readdirWithTypes throws on a file; that discriminates dir-vs-file in one call,
  // and its result is reused below for the children listing.
  let selfIsDir = false
  let entries: Array<{ name: string; isDirectory: boolean }> = []
  try {
    entries = await fs.readdirWithTypes(abs)
    selfIsDir = true
  } catch {
    selfIsDir = false
  }
  let selfMtime = 0
  let selfSize = 0
  try {
    const st = await fs.stat(abs)
    selfMtime = st.mtime
    selfSize = st.size
  } catch { /* keep zeros */ }

  // Self entry
  responses.push(entryXml(selfIsDir ? basePath : reqPath, selfIsDir, selfMtime, selfSize))

  // Children (Depth: 1 only, and only for directories)
  if (selfIsDir && depth !== '0') {
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
  // getcontentlength is undefined for collections per RFC 4918 — omit it for directories.
  const contentLength = isDir ? '' : `        <d:getcontentlength>${size}</d:getcontentlength>\n`
  return (
    `  <d:response>\n` +
    `    <d:href>${xmlEscape(encodeHref(href))}</d:href>\n` +
    `    <d:propstat>\n` +
    `      <d:prop>\n` +
    `        <d:resourcetype>${resourcetype}</d:resourcetype>\n` +
    `        <d:getlastmodified>${lastmod}</d:getlastmodified>\n` +
    contentLength +
    `      </d:prop>\n` +
    `      <d:status>HTTP/1.1 200 OK</d:status>\n` +
    `    </d:propstat>\n` +
    `  </d:response>`
  )
}
