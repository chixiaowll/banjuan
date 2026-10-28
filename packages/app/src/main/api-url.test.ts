import { describe, it, expect } from 'vitest'
import { parseUrl } from './api-url.js'

describe('parseUrl', () => {
  it('reads a space written as + (URLSearchParams, the CLI and the MCP server) or as %20', () => {
    expect(parseUrl('/api/search?q=Lasso+test').query.q).toBe('Lasso test')
    expect(parseUrl('/api/search?q=Lasso%20test').query.q).toBe('Lasso test')
    expect(parseUrl('/api/search?q=%E4%BA%BA%E5%B7%A5+%E6%99%BA%E8%83%BD').query.q).toBe('人工 智能')
  })

  it('keeps an encoded + and = in values, and the path as it is', () => {
    expect(parseUrl('/api/search?q=C%2B%2B&library=%2FUsers%2Fa%20b').query).toEqual({ q: 'C++', library: '/Users/a b' })
    expect(parseUrl('/api/x?a=b=c').query.a).toBe('b=c')
    expect(parseUrl('/api/notes/abc').path).toBe('/api/notes/abc')
    expect(parseUrl('/api/notes/abc').query).toEqual({})
  })

  it('does not fail on a malformed escape', () => {
    expect(parseUrl('/api/search?q=100%').query.q).toBe('100%')
  })
})
