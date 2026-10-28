import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

/** SHA-256 of a file, read as a stream (documents can be gigabytes). */
export function fileHash(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path).on('data', d => hash.update(d)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Which of `candidates` (absolute paths) holds the same bytes as `file`: the
 * index, or -1. Sizes first, so only files of the same size are read.
 */
export async function findSameContent(file: string, candidates: string[]): Promise<number> {
  const size = (await stat(file)).size
  let hash: string | null = null
  for (const [i, path] of candidates.entries()) {
    const s = await stat(path).catch(() => null)
    if (!s || s.size !== size) continue
    hash ??= await fileHash(file)
    if ((await fileHash(path)) === hash) return i
  }
  return -1
}
