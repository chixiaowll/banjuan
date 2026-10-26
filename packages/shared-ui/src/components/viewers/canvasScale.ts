/** Max canvas backing-store pixels (the pdf.js viewer's default, 2^24). */
export const MAX_CANVAS_PIXELS = 16_777_216

/**
 * Device pixels per CSS pixel for a canvas of this CSS size: the display's
 * ratio, lowered so the bitmap stays under `maxPixels`. At high zoom a page at
 * full devicePixelRatio reaches hundreds of megapixels and exhausts memory;
 * above the cap it is drawn at a lower resolution and stretched by CSS.
 */
export function canvasScale(cssWidth: number, cssHeight: number, maxPixels = MAX_CANVAS_PIXELS): number {
  const dpr = window.devicePixelRatio || 1
  const area = cssWidth * cssHeight
  return area > 0 ? Math.min(dpr, Math.sqrt(maxPixels / area)) : dpr
}
