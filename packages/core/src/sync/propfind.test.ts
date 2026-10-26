// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parsePropfind } from './propfind.js'

const response = (href: string, dir = false, extra = '') => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>
  ${dir ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/><d:getcontentlength>12</d:getcontentlength>'}
  <d:getlastmodified>Tue, 01 Sep 2026 10:00:00 GMT</d:getlastmodified>${extra}</d:prop></d:propstat></d:response>`
const multistatus = (...r: string[]) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${r.join('')}</d:multistatus>`

describe('parsePropfind', () => {
  it('strips the path of a server mounted below / (Nextcloud) and skips the folder itself', () => {
    const base = 'https://cloud.example.com/remote.php/dav/files/me'
    const xml = multistatus(
      response('/remote.php/dav/files/me/banjuan/', true),
      response('/remote.php/dav/files/me/banjuan/.banjuan/', true),
      response('/remote.php/dav/files/me/banjuan/%E8%AF%BB%E4%B9%A6%20%E7%AC%94%E8%AE%B0.md'),
      response('https://cloud.example.com/remote.php/dav/files/me/banjuan/a.pdf'),
    )
    const entries = parsePropfind(xml, '/banjuan/', base)
    expect(entries.map(e => [e.path, e.isDirectory])).toEqual([
      ['/banjuan/.banjuan', true], ['/banjuan/读书 笔记.md', false], ['/banjuan/a.pdf', false],
    ])
    expect(entries[1]).toMatchObject({ size: 12, mtime: Date.parse('Tue, 01 Sep 2026 10:00:00 GMT') })
  })

  it('works for a server at the root (the LAN host)', () => {
    const xml = multistatus(response('/', true), response('/notes.md'), response('/.banjuan/', true))
    expect(parsePropfind(xml, '/', 'http://192.168.1.5:8765').map(e => e.path)).toEqual(['/notes.md', '/.banjuan'])
  })
})
