import { describe, it, expect } from 'vitest'
import { isAuthorized, corsHeaders } from './api-auth.js'

const TOKEN = 'a'.repeat(64)
const req = (method: string, path: string, headers: { origin?: string; authorization?: string } = {}) => ({ method, path, ...headers })

describe('isAuthorized', () => {
  it('accepts the bearer token on any route', () => {
    expect(isAuthorized(req('DELETE', '/api/notes/x', { authorization: `Bearer ${TOKEN}` }), TOKEN)).toBe(true)
  })
  it('rejects a missing or wrong token (CLI-style request without Origin)', () => {
    expect(isAuthorized(req('GET', '/api/notes'), TOKEN)).toBe(false)
    expect(isAuthorized(req('GET', '/api/notes', { authorization: `Bearer ${'b'.repeat(64)}` }), TOKEN)).toBe(false)
    expect(isAuthorized(req('GET', '/api/notes', { authorization: `Bearer ${TOKEN}x` }), TOKEN)).toBe(false)
    expect(isAuthorized(req('GET', '/api/notes', { authorization: TOKEN }), TOKEN)).toBe(false)
  })
  it('rejects web pages even on the clipper routes', () => {
    expect(isAuthorized(req('POST', '/api/clip', { origin: 'https://evil.example' }), TOKEN)).toBe(false)
    expect(isAuthorized(req('GET', '/api/app/quit', { origin: 'http://localhost:3000' }), TOKEN)).toBe(false)
  })
  it('lets a browser extension use only the clipper routes without a token', () => {
    const origin = 'chrome-extension://abcdefghijklmnop'
    expect(isAuthorized(req('GET', '/api/status', { origin }), TOKEN)).toBe(true)
    expect(isAuthorized(req('POST', '/api/clip', { origin }), TOKEN)).toBe(true)
    expect(isAuthorized(req('GET', '/api/notes', { origin }), TOKEN)).toBe(false)
    expect(isAuthorized(req('DELETE', '/api/clip', { origin }), TOKEN)).toBe(false)
  })
  it('never authorizes when the server has no token yet', () => {
    expect(isAuthorized(req('GET', '/api/status', { authorization: 'Bearer ' }), '')).toBe(false)
  })
})

describe('corsHeaders', () => {
  it('echoes extension origins and allows the Authorization header', () => {
    const h = corsHeaders('chrome-extension://abc')
    expect(h['Access-Control-Allow-Origin']).toBe('chrome-extension://abc')
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization')
  })
  it('sends no CORS grant to web pages or non-browser clients', () => {
    expect(corsHeaders('https://evil.example')).toEqual({})
    expect(corsHeaders(undefined)).toEqual({})
  })
})
