import { useEffect, useRef } from 'react'
import { registerFlush } from './flushRegistry.js'

type SaveRun = () => Promise<void> | void

/**
 * Debounces saves without ever dropping the last edit: `flush()` runs the
 * pending save immediately. Each `schedule` captures its own run (and thus the
 * note id it was bound to), so a flush after switching notes saves the right one.
 */
export class DebouncedSaver {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: SaveRun | null = null

  constructor(private delay = 800) {}

  get hasPending(): boolean { return this.pending !== null }

  schedule(run: SaveRun): void {
    this.pending = run
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, this.delay)
  }

  flush(): Promise<void> | void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    const run = this.pending
    this.pending = null
    return run?.()
  }
}

/**
 * A DebouncedSaver that flushes when the component unmounts, when the page
 * unloads, and when `flushKey` changes — pass the note id so switching notes in
 * the same component saves the previous note before the next edit replaces it.
 */
export function useDebouncedSaver(delay = 800, flushKey?: unknown): DebouncedSaver {
  const ref = useRef<DebouncedSaver | null>(null)
  if (!ref.current) ref.current = new DebouncedSaver(delay)
  useEffect(() => {
    const saver = ref.current!
    const onUnload = () => { void saver.flush() }
    window.addEventListener('beforeunload', onUnload)
    // Window close / app quit wait for this (see flushRegistry).
    const unregister = registerFlush(() => saver.flush())
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      unregister()
      void saver.flush()
    }
  }, [])
  useEffect(() => () => { void ref.current!.flush() }, [flushKey])
  return ref.current
}
