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
