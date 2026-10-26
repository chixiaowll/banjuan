import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { noteFileLock } from '../storage/keyed-lock.js'

/** Lock key for one note's file (by id, not path: moving the note changes the path). */
export function noteLockKey(notesDir: string, noteId: string): string {
  return `${notesDir}#${noteId}`
}

/**
 * Read a note's JSON file, apply `change`, write it back — under the note's
 * lock, with the path looked up inside it (a queued move may have changed it).
 * Returns whether the file was written; `change` returning false skips the write.
 * Throws when the note or its file is gone or unreadable: callers that went on
 * to update the index regardless left the edit in the DB only, to vanish on
 * the next rebuild.
 */
export function mutateNoteFile(
  db: PlatformDatabase, fs: PlatformFS, notesDir: string, noteId: string,
  change: (data: any) => void | false,
): Promise<boolean> {
  return noteFileLock.run(noteLockKey(notesDir, noteId), async () => {
    const row = db.queryOne<{ path: string }>('SELECT path FROM notes WHERE id = ?', [noteId])
    if (!row?.path) throw new Error(`Note not found: ${noteId}`)
    const fullPath = join(notesDir, row.path)
    if (!(await fs.exists(fullPath))) throw new Error(`Note file missing: ${row.path}`)
    let data: any
    try { data = JSON.parse(await fs.readTextFile(fullPath)) } catch (e) {
      throw new Error(`Note file unreadable: ${row.path}: ${(e as Error)?.message}`)
    }
    if (change(data) === false) return false
    await fs.writeTextFile(fullPath, JSON.stringify(data, null, 2))
    return true
  })
}
