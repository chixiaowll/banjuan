import { describe, it, expect } from 'vitest'
import { htmlPageForFile } from './htmlPage.js'

const enc = (s: string) => new TextEncoder().encode(s)
const BASE = '<base href="local-file:///p/w/">'

describe('htmlPageForFile', () => {
  it('puts the base first in <head>, else after <html> or the doctype (keeping standards mode)', () => {
    expect(htmlPageForFile(enc('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"></head></html>'), '/p/w/a.html'))
      .toBe(`<!DOCTYPE html><html lang="zh"><head>${BASE}<meta charset="utf-8"></head></html>`)
    expect(htmlPageForFile(enc('<!doctype html><html><body><header>x</header></body></html>'), '/p/w/a.html'))
      .toBe(`<!doctype html><html>${BASE}<body><header>x</header></body></html>`)
    expect(htmlPageForFile(enc('<!doctype html><p>x</p>'), '/p/w/a.html')).toBe(`<!doctype html>${BASE}<p>x</p>`)
  })

  it('leaves a page that names its own base alone', () => {
    const page = '<html><head><base href="https://example.com/"></head></html>'
    expect(htmlPageForFile(enc(page), '/p/w/a.html')).toBe(page)
  })

  it('reads the page in the charset it declares, and a BOM wins over that', () => {
    const gbk = Uint8Array.from([...enc('<meta charset="gbk"><p>'), 0xd6, 0xd0, 0xce, 0xc4, ...enc('</p>')])   // 中文 in GBK
    expect(htmlPageForFile(gbk, '/p/w/a.html')).toContain('<p>中文</p>')
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('<meta charset="gbk"><p>中文</p>')])
    expect(htmlPageForFile(bom, '/p/w/a.html')).toContain('<p>中文</p>')
    expect(htmlPageForFile(enc('<meta charset="no-such"><p>中文</p>'), '/p/w/a.html')).toContain('<p>中文</p>')
  })
})
