import { describe, it, expect, vi } from 'vitest'
import { clipSlug, stripScripts, inlineImages } from './clip-service.js'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
function fakeFetch(map: Record<string, { status?: number; type?: string; body?: Buffer } | 'throw'>) {
  return vi.fn(async (url: string) => {
    const r = map[url]
    if (!r || r === 'throw') throw new Error('network')
    return new Response(new Uint8Array(r.body ?? png), { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'image/png' } })
  })
}

describe('clipSlug', () => {
  it('keeps letters of any script', () => {
    expect(clipSlug('東京の天気 — 今日')).toBe('東京の天気-今日')
    expect(clipSlug('Hello, World!')).toBe('hello-world')
  })
  it('never returns an empty name', () => {
    expect(clipSlug('!!!')).toBe('clip')
  })
})

describe('stripScripts', () => {
  it('removes script and noscript blocks', () => {
    expect(stripScripts('<p>a</p><script>alert(1)</script><noscript><img></noscript><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })
})

describe('inlineImages', () => {
  it('inlines images resolved against the page URL and drops srcset', async () => {
    const fetcher = fakeFetch({ 'https://site.test/img/a.png': {} })
    const html = '<p><img alt="x" src="/img/a.png" srcset="/img/a@2x.png 2x" sizes="100vw"></p>'
    const out = await inlineImages(html, 'https://site.test/post/1', fetcher)
    expect(out).toBe(`<p><img alt="x" src="data:image/png;base64,${png.toString('base64')}"></p>`)
    expect(fetcher).toHaveBeenCalledWith('https://site.test/img/a.png', expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://site.test/post/1' }) }))
  })

  it('keeps the remote URL when a download fails or is not an image', async () => {
    const fetcher = fakeFetch({ 'https://s.test/b.png': { status: 404 }, 'https://s.test/c.png': { type: 'text/html' }, 'https://s.test/d.png': 'throw' })
    const html = '<img src="https://s.test/b.png"><img src="https://s.test/c.png"><img src="https://s.test/d.png">'
    expect(await inlineImages(html, 'https://s.test/', fetcher)).toBe(html)
  })

  it('downloads each URL once and leaves data: URIs alone', async () => {
    const fetcher = fakeFetch({ 'https://s.test/a.png': {} })
    const html = `<img src="https://s.test/a.png"><img src='https://s.test/a.png'><img src="data:image/gif;base64,R0lG">`
    const out = await inlineImages(html, 'https://s.test/', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(out.match(/data:image\/png/g)).toHaveLength(2)
    expect(out).toContain('data:image/gif;base64,R0lG')
  })
})
