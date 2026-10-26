import { useState, useEffect, useRef, useCallback } from 'react'
import { useBanjuanAPI } from '../../api.js'
import { useIsActiveTab } from '../tabActive.js'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useReadingTimer(docId: string, _metadata: Record<string, unknown>) {
  const api = useBanjuanAPI()
  const [elapsed, setElapsed] = useState(0)
  const accumulatedRef = useRef(0)
  const sessionStartRef = useRef(0)
  const activeRef = useRef(false)
  const [ready, setReady] = useState(false)
  /** The document whose total accumulatedRef holds. */
  const loadedDocRef = useRef<string | null>(null)
  // Time counts only while this document is in front: its tab the active one
  // and the window focused. Every open book used to count, all at once.
  const tabActive = useIsActiveTab()
  const [focused, setFocused] = useState(() => typeof document === 'undefined' || document.hasFocus())
  const running = ready && tabActive && focused

  useEffect(() => {
    setReady(false)
    let cancelled = false
    api.documents.get(docId).then((fresh: any) => {
      if (cancelled) return
      const saved = (fresh?.metadata?.readingTimeMs as number) ?? 0
      accumulatedRef.current = saved
      loadedDocRef.current = docId
      setElapsed(saved)
      setReady(true)
    }).catch(() => {
      if (cancelled) return
      accumulatedRef.current = 0
      loadedDocRef.current = docId
      setElapsed(0)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [docId])

  useEffect(() => {
    const onBlur = () => setFocused(false)
    const onFocus = () => setFocused(true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // One reading session while running; its time is added when it stops.
  useEffect(() => {
    if (!running) return
    activeRef.current = true
    sessionStartRef.current = Date.now()
    const tick = setInterval(() => setElapsed(accumulatedRef.current + (Date.now() - sessionStartRef.current)), 1000)
    return () => {
      clearInterval(tick)
      activeRef.current = false
      accumulatedRef.current += Date.now() - sessionStartRef.current
      setElapsed(accumulatedRef.current)
    }
  }, [running, docId])

  const flush = useCallback(() => {
    if (!ready || loadedDocRef.current !== docId) return
    const total = activeRef.current
      ? accumulatedRef.current + (Date.now() - sessionStartRef.current)
      : accumulatedRef.current
    api.documents.update(docId, {
      metadata: { readingTimeMs: total },
    }).catch(() => {})
  }, [docId, ready])

  useEffect(() => {
    const timer = setInterval(flush, 30000)
    return () => {
      clearInterval(timer)
      flush()
    }
  }, [flush])

  return { elapsed, formatted: formatTime(elapsed) }
}
