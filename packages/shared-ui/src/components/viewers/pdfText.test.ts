import { describe, it, expect } from 'vitest'
import { charsToPageRects } from './pdfText.js'

const ch = (x1: number, y1: number, x2: number, y2: number) => ({ c: 'a', rect: [x1, y1, x2, y2] as [number, number, number, number] })

describe('charsToPageRects', () => {
  it('places text on a page whose crop box does not start at 0,0', () => {
    // CropBox [0 400 612 792]: viewport transform [1,0,0,-1,0,792]; displayed height 392.
    const info = { width: 612, height: 792, chars: [], transform: [1, 0, 0, -1, 0, 792] as any, viewWidth: 612, viewHeight: 392 }
    const [r] = charsToPageRects(info, [ch(72, 716, 82, 734), ch(82, 716, 92, 734)])
    expect(r.x).toBeCloseTo(72 / 612)
    expect(r.y).toBeCloseTo((792 - 734) / 392)
    expect(r.w).toBeCloseTo(20 / 612)
  })

  it("merges a rotated page's vertical run into one rectangle", () => {
    // /Rotate 90 on 612x792: transform [0,1,1,0,0,0]; displayed 792 wide, 612 high.
    const info = { width: 612, height: 792, chars: [], transform: [0, 1, 1, 0, 0, 0] as any, viewWidth: 792, viewHeight: 612 }
    const rects = charsToPageRects(info, [ch(72, 716, 82, 734), ch(82, 716, 92, 734), ch(92, 716, 102, 734)])
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBeCloseTo(716 / 792)
    expect(rects[0].y).toBeCloseTo(72 / 612)
    expect(rects[0].h).toBeCloseTo(30 / 612)
  })
})
