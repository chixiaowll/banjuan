import { useCallback, useEffect, useRef, useState } from 'react'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'
import { toast } from '../components/feedback.js'

// A note can be open in more than one editor (a tab and a PDF's side panel),
// and can change outside every editor (a sync, the AI assistant through the
// local API). Each editor used to keep what it loaded and later save it over
// the newer version. Now an editor announces its saves, and the others reload
// — unless they have unsaved edits of their own, which then win (with a notice).

const EVENT = 'banjuan:note-content-changed'
interface NoteChange { noteId: string; source?: unknown }

/** `source` identifies the announcing editor, so it doesn't reload its own save. */
export function announceNoteChanged(noteId: string, source?: unknown): void {
  document.dispatchEvent(new CustomEvent<NoteChange>(EVENT, { detail: { noteId, source } }))
}

/** Any note may have changed (after a sync, or a write through the local API). */
export function announceAllNotesChanged(): void {
  announceNoteChanged('*')
}

/** Calls `onChange` when `noteId` (or every note) changed from somewhere other than `source`. */
export function useNoteChangedElsewhere(noteId: string | null | undefined, source: unknown, onChange: () => void): void {
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    if (!noteId) return
    const handler = (e: Event) => {
      const d = (e as CustomEvent<NoteChange>).detail
      if ((d.noteId === noteId || d.noteId === '*') && d.source !== source) cb.current()
    }
    document.addEventListener(EVENT, handler)
    return () => document.removeEventListener(EVENT, handler)
  }, [noteId, source])
}

const normalize = (json: string | null | undefined): string => {
  try { return JSON.stringify(JSON.parse(json ?? '')) } catch { return json ?? '' }
}

/**
 * For a BlockNote note editor: tell `known()` what the editor loaded or saved,
 * call `announceSaved()` after a save, and put `reloadKey` in the editor's key.
 * When the note changes elsewhere and `isDirty()` is false, `apply(content)`
 * gets the stored content and `reloadKey` changes so the editor remounts.
 */
export function useNoteContentSync(noteId: string, opts: { isDirty: () => boolean; apply: (content: string) => void }) {
  const api = useBanjuanAPI()
  const t = useT()
  const [source] = useState(() => ({}))
  const [reloadKey, setReloadKey] = useState(0)
  const knownRef = useRef<string>('')
  const optsRef = useRef(opts)
  optsRef.current = opts

  const known = useCallback((content: string) => { knownRef.current = normalize(content) }, [])
  const announceSaved = useCallback(() => announceNoteChanged(noteId, source), [noteId, source])

  useNoteChangedElsewhere(noteId, source, () => {
    void (async () => {
      const full = await api.notes.get(noteId).catch(() => null)
      if (!full || normalize(full.content) === knownRef.current) return   // nothing new for this note
      if (optsRef.current.isDirty()) {
        toast.info(t('note.changedElsewhere'), { key: `note-changed-${noteId}` })
        return
      }
      knownRef.current = normalize(full.content)
      optsRef.current.apply(full.content ?? '')
      setReloadKey(k => k + 1)
    })()
  })

  return { source, reloadKey, known, announceSaved }
}
