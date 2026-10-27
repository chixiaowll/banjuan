import { watch, type FSWatcher, type Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, basename } from 'node:path'

export type FileWatchEvent = { kind: 'changed'; stamp: string } | { kind: 'gone' }

/** A file's version: size and modification time. */
export const stampOf = (s: Pick<Stats, 'size' | 'mtimeMs'>) => `${s.size}:${Math.floor(s.mtimeMs)}`

/**
 * Tell when a file changes outside this app, or goes away. The folder is
 * watched, not the file: editors that save by renaming a new file over the old
 * one would otherwise leave the watch on a file that no longer exists. Writes
 * this app made itself (`markOwnWrite`) are not reported.
 */
export function watchFile(path: string, onEvent: (e: FileWatchEvent) => void): { markOwnWrite(stamp: string): void; close(): void } {
  const name = basename(path)
  let known: string | null = null
  let gone = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  void stat(path).then(s => { known ??= stampOf(s) }, () => {})

  const check = async () => {
    if (closed) return
    let now: string | null = null
    try { now = stampOf(await stat(path)) } catch { now = null }
    if (closed) return
    if (now === null) {
      if (!gone) { gone = true; onEvent({ kind: 'gone' }) }
      return
    }
    gone = false
    if (now === known) return
    known = now
    onEvent({ kind: 'changed', stamp: now })
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(dirname(path), (_event, file) => {
      if (file && file !== name) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; void check() }, 150)
    })
  } catch (e) {
    console.warn('[file-watch] cannot watch', path, e)
  }

  return {
    markOwnWrite(stamp: string) { known = stamp; gone = false },
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      watcher?.close()
    },
  }
}
