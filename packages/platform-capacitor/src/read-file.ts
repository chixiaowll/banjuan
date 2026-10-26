import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

/**
 * A file under Documents as bytes. Read through the web view's own file URL
 * (served natively, no copy through the bridge); the bridge's readFile hands
 * the whole file over as one base64 string — a third larger, then decoded byte
 * by byte into another copy — slow, and a large book ran the app out of memory.
 * Falls back to the bridge, which also reports a missing file as before.
 */
export async function readDocumentsFile(path: string): Promise<Uint8Array> {
  try {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents })
    const res = await fetch(Capacitor.convertFileSrc(uri))
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
  } catch { /* not served: read over the bridge */ }
  const { data } = await Filesystem.readFile({ path, directory: Directory.Documents })
  return base64ToBytes(data as string)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
