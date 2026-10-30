/**
 * "Open this note at that block" (a task link, the to-do list). The note's
 * editor may not exist yet — it mounts when its tab opens — so the request
 * waits here until the editor for that note takes it (like docNavigation.ts).
 */
const pending = new Map<string, string>()
const EVENT = 'banjuan:note-block-request'

export function requestNoteBlock(noteId: string, blockId: string): void {
  pending.set(noteId, blockId)
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { noteId } }))
}

/** The pending block for this note, consumed (returned once). */
export function takeNoteBlock(noteId: string): string | undefined {
  const blockId = pending.get(noteId)
  pending.delete(noteId)
  return blockId
}

export function onNoteBlockRequest(noteId: string, handler: () => void): () => void {
  const listener = (e: Event) => { if ((e as CustomEvent).detail?.noteId === noteId) handler() }
  document.addEventListener(EVENT, listener)
  return () => document.removeEventListener(EVENT, listener)
}

/** Scroll a block of this editor into view and flash it; waits a little for the editor to render it. */
export async function revealBlock(root: HTMLElement, blockId: string): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const el = root.querySelector(`.bn-block-outer[data-id="${CSS.escape(blockId)}"]`) as HTMLElement | null
    if (el && el.offsetParent !== null) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.remove('bj-block-flash')
      void el.offsetWidth   // restart the animation
      el.classList.add('bj-block-flash')
      setTimeout(() => el.classList.remove('bj-block-flash'), 2000)
      return true
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return false
}
