import { timingSafeEqual } from 'node:crypto'

/**
 * Local API access control. The server listens on 127.0.0.1, but any web page
 * can still reach that address, so every request must carry the per-launch
 * token from ~/.banjuan/api-token (0600) as `Authorization: Bearer <token>`.
 * The one exception is the web-clipper browser extension, which can't read
 * files: requests whose Origin is a browser extension may use the clipper's
 * routes. Browsers set Origin themselves, so a page can't pose as an extension.
 * An extension's GET carries no Origin at all, so `GET /api/status` is public —
 * the server answers it without a token with nothing more than "running, and
 * which library is open" (no paths).
 */

const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[^/]+$/
const EXTENSION_ROUTES = new Set(['GET /api/status', 'POST /api/clip'])

export interface AuthRequest {
  method: string
  path: string
  origin?: string
  authorization?: string
}

function tokenMatches(authorization: string | undefined, token: string): boolean {
  if (!token || !authorization?.startsWith('Bearer ')) return false
  const got = Buffer.from(authorization.slice('Bearer '.length))
  const want = Buffer.from(token)
  return got.length === want.length && timingSafeEqual(got, want)
}

export function isAuthorized(req: AuthRequest, token: string): boolean {
  if (tokenMatches(req.authorization, token)) return true
  return !!req.origin && EXTENSION_ORIGIN.test(req.origin) && EXTENSION_ROUTES.has(`${req.method} ${req.path}`)
}

/** CORS grant for browser-extension origins only — never `*`. */
export function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

/** Readable without a token (with a reduced answer — see the server). */
export function isPublicRoute(method: string, path: string): boolean {
  return method === 'GET' && path === '/api/status'
}

/**
 * The Host header must name the loopback address we listen on. A DNS-rebinding
 * page (evil.example re-resolved to 127.0.0.1) is same-origin with itself and
 * could read our answers, but its requests carry its own host name.
 */
export function isLoopbackHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}
