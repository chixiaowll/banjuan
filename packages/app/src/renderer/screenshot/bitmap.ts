/**
 * Electron's nativeImage.toBitmap() is BGRA; canvas ImageData wants RGBA.
 * Screen captures are opaque, so alpha is forced to 255. Uses a 32-bit view
 * (one op per pixel) when the buffer is 4-byte aligned — an IPC-delivered
 * Uint8Array can start at any offset, so fall back to bytes otherwise.
 */
export function bgraToRgba(src: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  if (src.byteOffset % 4 === 0 && src.length % 4 === 0) {
    const s = new Uint32Array(src.buffer, src.byteOffset, src.length / 4)
    const d = new Uint32Array(out.buffer)
    for (let i = 0; i < s.length; i++) {
      const v = s[i]
      // little-endian: BGRA bytes = 0xAARRGGBB, RGBA bytes = 0xAABBGGRR
      d[i] = (0xff000000 | (v & 0x0000ff00) | ((v >>> 16) & 0xff) | ((v & 0xff) << 16)) >>> 0
    }
    return out
  }
  for (let i = 0; i < src.length; i += 4) {
    out[i] = src[i + 2]
    out[i + 1] = src[i + 1]
    out[i + 2] = src[i]
    out[i + 3] = 255
  }
  return out
}

export function hexOf(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}
