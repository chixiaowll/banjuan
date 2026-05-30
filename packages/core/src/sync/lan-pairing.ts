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
