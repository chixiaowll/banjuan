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
type Flusher = () => unknown

const flushers = new Map<Phase, Set<Flusher>>([['collect', new Set()], ['write', new Set()]])

export function registerFlush(fn: Flusher, phase: Phase = 'write'): () => void {
  flushers.get(phase)!.add(fn)
  return () => { flushers.get(phase)!.delete(fn) }
}

/**
 * For an editor's store: registered while the editor is mounted, then flushed
 * once more when it unmounts (a closed tab) — after the rest of that unmount,
 * whose cleanups may still hand the store their last change, and staying
 * registered until the write is done, so a window closing meanwhile waits for
 * it. Unregistering at once lost a save still on its timer.
 */
export function registerFlushUntilWritten(fn: Flusher): () => void {
  const unregister = registerFlush(fn)
  return () => {
    void Promise.resolve()
      .then(fn)
      .catch(e => console.error('[flush] write on close failed', e))
      .finally(unregister)
  }
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
