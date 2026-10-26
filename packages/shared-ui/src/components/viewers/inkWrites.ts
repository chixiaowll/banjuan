/**
 * Ink saves of one document, one at a time, each on the annotations as stored
 * right then. The overlays' props lag behind until the viewer reloads: two
 * quick strokes both saw "no ink here yet" and made two annotations, or the
 * second rewrote the annotation without the first stroke.
 */
const queues = new Map<string, Promise<unknown>>()

export function queueInkWrite<T>(docId: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(docId) ?? Promise.resolve()).then(job)
  const tail = run.then(() => {}, () => {})
  queues.set(docId, tail)
  void tail.then(() => { if (queues.get(docId) === tail) queues.delete(docId) })
  return run
}

/** A PDF ink stroke was saved: the viewer keeps these in drawing order for undo. */
export interface InkStrokeSaved { docId: string; page: number; annotationId: string }
const STROKE_EVENT = 'banjuan:pdf-ink-stroke'

export function announceInkStroke(detail: InkStrokeSaved): void {
  window.dispatchEvent(new CustomEvent<InkStrokeSaved>(STROKE_EVENT, { detail }))
}

export function onInkStrokeSaved(handler: (e: InkStrokeSaved) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<InkStrokeSaved>).detail)
  window.addEventListener(STROKE_EVENT, listener)
  return () => window.removeEventListener(STROKE_EVENT, listener)
}
