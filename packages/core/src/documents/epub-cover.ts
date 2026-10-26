import { unzipSync, strFromU8 } from 'fflate'

/**
 * The bytes of an EPUB's cover image: the EPUB 3 "cover-image" item, the
 * EPUB 2 <meta name="cover">, or an image named like a cover. Null if none.
 */
export function epubCoverImage(data: Uint8Array): Uint8Array | null {
  // The package files first, then only the cover: unzipping every image of an
  // illustrated book to find one took seconds and hundreds of megabytes.
  const files = unzipSync(data, { filter: f => f.name.endsWith('.opf') || f.name === 'META-INF/container.xml' })
  const container = files['META-INF/container.xml']
  const opfPath = container ? strFromU8(container).match(/full-path="([^"]+)"/)?.[1] : undefined
  if (!opfPath || !files[opfPath]) return null
  const opf = strFromU8(files[opfPath])
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const items = [...opf.matchAll(/<item\b[^>]*>/g)].map(m => {
    const tag = m[0]
    const attr = (n: string) => tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]
    return { id: attr('id'), href: attr('href'), type: attr('media-type') ?? '', props: attr('properties') ?? '' }
  })
  const coverId = opf.match(/<meta\b[^>]*name="cover"[^>]*content="([^"]+)"/)?.[1] ?? opf.match(/<meta\b[^>]*content="([^"]+)"[^>]*name="cover"/)?.[1]
  const pick = items.find(i => /\bcover-image\b/.test(i.props))
    ?? items.find(i => coverId && i.id === coverId)
    ?? items.find(i => i.type.startsWith('image/') && /cover/i.test(`${i.id} ${i.href}`))
  if (!pick?.href) return null
  const wanted = new Set([dir + decodeURIComponent(pick.href), decodeURIComponent(pick.href)])
  const image = unzipSync(data, { filter: f => wanted.has(f.name) })
  return image[dir + decodeURIComponent(pick.href)] ?? image[decodeURIComponent(pick.href)] ?? null
}
