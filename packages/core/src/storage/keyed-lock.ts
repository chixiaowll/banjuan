/**
 * Runs async jobs one at a time per key, in call order. A note's JSON file is
 * changed by read → modify → write in several services (mind-map nodes, note
 * title/typeMeta, tags); two of those overlapping on the same file meant the
 * later write was based on a stale read and erased the earlier change.
 */
export class KeyedLock {
  private tails = new Map<string, Promise<void>>()

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const result = prev.then(job)
    const tail = result.then(() => {}, () => {})
    this.tails.set(key, tail)
    void tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key) })
    return result
  }
}

/** Shared by every service that rewrites a note file; keyed by the file's absolute path. */
export const noteFileLock = new KeyedLock()
