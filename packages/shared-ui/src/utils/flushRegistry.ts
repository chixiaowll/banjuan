/**
 * Everything holding unsaved edits behind a timer (debounced note saves, the
 * handwriting editor's 2s stroke batching, mind-map layout/title) registers a
 * flusher here. Before the window closes or the app quits, the main process
 * asks the renderer to flushAll() and waits for it — a timer pending at that
 * moment would otherwise die with the renderer and the edit be lost.
 *
 * Two phases: 'collect' moves pending UI state into its store (e.g. the
 * handwriting canvas snapshot), 'write' persists stores to disk. All collects
 * run before any write, so a store never writes before its UI handed it the
 * latest state.
 */
type Phase = 'collect' | 'write'
type Flusher = () => void | Promise<void>

const flushers = new Map<Phase, Set<Flusher>>([['collect', new Set()], ['write', new Set()]])

export function registerFlush(fn: Flusher, phase: Phase = 'write'): () => void {
  flushers.get(phase)!.add(fn)
  return () => { flushers.get(phase)!.delete(fn) }
}

async function runPhase(phase: Phase): Promise<void> {
  await Promise.all([...flushers.get(phase)!].map(async fn => {
    try { await fn() } catch (e) { console.error(`[flush] ${phase} failed`, e) }
  }))
}

export async function flushAll(): Promise<void> {
  await runPhase('collect')
  await runPhase('write')
}
