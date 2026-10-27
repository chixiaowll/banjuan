import { describe, it, expect } from 'vitest'
import { withLocalImages } from './localImages.js'

describe('withLocalImages', () => {
  it('points relative image links at the file\'s folder and leaves the rest alone', () => {
    const md = '![a](img/a.png)\n![b](../b.jpg "t")\n![c](https://x.org/c.png)\n<img src="d.webp">\n[link](note.md)'
    const out = withLocalImages(md, '/Users/me/Notes/day.md')
    expect(out).toContain(`![a](local-file://${encodeURIComponent('/Users/me/Notes/img/a.png')})`)
    expect(out).toContain(`![b](local-file://${encodeURIComponent('/Users/me/b.jpg')} "t")`)
    expect(out).toContain('![c](https://x.org/c.png)')
    expect(out).toContain(`<img src="local-file://${encodeURIComponent('/Users/me/Notes/d.webp')}">`)
    expect(out).toContain('[link](note.md)')
  })
})
