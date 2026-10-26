import type * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import type { PdfChar, PageInfo } from './PdfPage.js'

type Matrix = [number, number, number, number, number, number]

/** Characters (with their PDF-space boxes) and the page geometry needed to place them. */
export function pageInfoFrom(page: pdfjsLib.PDFPageProxy, textContent: { items: unknown[] }): PageInfo {
  const chars: PdfChar[] = []
  for (const item of textContent.items as any[]) {
    if (Array.isArray(item.chars)) for (const c of item.chars) if (c?.rect) chars.push(c)
  }
  const [, , vbW, vbH] = (page as any).view as [number, number, number, number]
  const vp = page.getViewport({ scale: 1 })
  return { width: vbW, height: vbH, chars, transform: vp.transform as Matrix, viewWidth: vp.width, viewHeight: vp.height }
}

/** A page's text without rendering it (search reaches pages that were never on screen). */
export async function loadPageInfo(pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<PageInfo> {
  const page = await pdfDoc.getPage(pageNum)
  return pageInfoFrom(page, await page.getTextContent())
}

/**
 * Character boxes as rectangles in page fractions (0..1, top-left origin) as the
 * page is displayed, merged per line. Goes through the page's viewport, so a
 * CropBox not starting at 0,0 and a rotated page come out right; plain
 * `x / width, 1 - y / height` put highlights in the wrong place on those.
 */
export function charsToPageRects(info: PageInfo, chars: PdfChar[]): Array<{ x: number; y: number; w: number; h: number }> {
  const m = info.transform
  const W = info.viewWidth ?? info.width
  const H = info.viewHeight ?? info.height
  const apply = (x: number, y: number): [number, number] => m
    ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
    : [x, info.height - y]
  const rects: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const ch of chars) {
    const [ax, ay] = apply(ch.rect[0], ch.rect[1])
    const [bx, by] = apply(ch.rect[2], ch.rect[3])
    const rx = Math.min(ax, bx) / W, ry = Math.min(ay, by) / H
    const rw = Math.abs(bx - ax) / W, rh = Math.abs(by - ay) / H
    const last = rects[rects.length - 1]
    if (last && Math.abs(last.y - ry) < rh * 0.5 && rh >= rw * 0.5) {   // same line (horizontal text)
      const right = Math.max(last.x + last.w, rx + rw)
      last.x = Math.min(last.x, rx)
      last.w = right - last.x
    } else if (last && Math.abs(last.x - rx) < rw * 0.5 && rw > rh) {   // same column (text on a rotated page)
      const bottom = Math.max(last.y + last.h, ry + rh)
      last.y = Math.min(last.y, ry)
      last.h = bottom - last.y
      last.w = Math.max(last.w, rw)
    } else {
      rects.push({ x: rx, y: ry, w: rw, h: rh })
    }
  }
  return rects
}
