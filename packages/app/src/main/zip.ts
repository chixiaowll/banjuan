import { writeFileSync } from 'node:fs'
import { zipSync, strToU8, type Zippable } from 'fflate'

// Already-compressed formats: store as-is instead of spending CPU deflating them.
const STORED = /\.(png|jpe?g|gif|webp|avif|heic|pdf|zip|gz|mp3|m4a|mp4|mov)$/i

/**
 * Build a zip in memory and write it to `filePath`. Keys are entry paths
 * ("folder/sub/file.md"). No shell and no temp directory — names are only ever
 * zip entry names, so a note title like `$(…)` can't run anything, and it works
 * on Windows (which has no `zip` command).
 */
export function writeZip(filePath: string, files: Record<string, Uint8Array | string>): void {
  const entries: Zippable = {}
  for (const [name, data] of Object.entries(files)) {
    const bytes = typeof data === 'string' ? strToU8(data) : data
    entries[name] = STORED.test(name) ? [bytes, { level: 0 }] : bytes
  }
  writeFileSync(filePath, zipSync(entries))
}
