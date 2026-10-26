import { describe, it, expect, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'

vi.mock('electron', () => ({
  nativeImage: { createFromBuffer: (b: Buffer) => ({ isEmpty: () => b.length === 0, bytes: b }) },
}))
const { epubCover } = await import('./covers.js')

const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
const epub = (opfManifest: string, metadata = '', files: Record<string, Uint8Array> = {}) => zipSync({
  mimetype: strToU8('application/epub+zip'),
  'META-INF/container.xml': strToU8(container),
  'OEBPS/content.opf': strToU8(`<package><metadata>${metadata}</metadata><manifest>${opfManifest}</manifest></package>`),
  ...files,
})
const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n])
const picked = (img: any) => img && Array.from(img.bytes as Buffer)

describe('epubCover', () => {
  it('takes the EPUB 3 cover-image item', () => {
    const data = epub('<item id="a" href="img/a.png" media-type="image/png"/><item id="c" href="img/c.png" media-type="image/png" properties="cover-image"/>',
      '', { 'OEBPS/img/a.png': png(1), 'OEBPS/img/c.png': png(2) })
    expect(picked(epubCover(data))).toEqual(Array.from(png(2)))
  })

  it('takes the EPUB 2 <meta name="cover"> item', () => {
    const data = epub('<item id="pic" href="cover%20art.png" media-type="image/png"/>', '<meta name="cover" content="pic"/>', { 'OEBPS/cover art.png': png(3) })
    expect(picked(epubCover(data))).toEqual(Array.from(png(3)))
  })

  it('falls back to an image named like a cover, and gives up without one', () => {
    expect(picked(epubCover(epub('<item id="i1" href="Cover.jpg" media-type="image/jpeg"/>', '', { 'OEBPS/Cover.jpg': png(4) })))).toEqual(Array.from(png(4)))
    expect(epubCover(epub('<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>'))).toBeNull()
  })
})
