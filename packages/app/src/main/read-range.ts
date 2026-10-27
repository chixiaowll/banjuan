import { open } from 'node:fs/promises'

/** Bytes [start, end) of a file; one call reads at most 64 MB. */
export async function readByteRange(path: string, start: number, end: number): Promise<Buffer> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) throw new Error('Invalid byte range')
  const length = Math.min(end - start, 64 * 1024 * 1024)
  const handle = await open(path, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, start)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
