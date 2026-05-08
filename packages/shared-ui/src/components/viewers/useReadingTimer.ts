import { useState, useEffect, useRef, useCallback } from 'react'
import { useBanjuanAPI } from '../../api.js'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useReadingTimer(docId: string, metadata: Record<string, unknown>) {
  const api = useBanjuanAPI()
  const [elapsed, setElapsed] = useState(0)
  const accumulatedRef = useRef(0)
  const sessionStartRef = useRef(0)
  const activeRef = useRef(true)
  const metadataRef = useRef(metadata)
  const readyRef = useRef(false)
  metadataRef.current = metadata

  useEffect(() => {
    readyRef.current = false
    activeRef.current = true
    sessionStartRef.current = Date.now()

    api.documents.get(docId).then((fresh: any) => {
      const saved = (fresh?.metadata?.readingTimeMs as number) ?? 0
      accumulatedRef.current = saved
      metadataRef.current = fresh?.metadata ?? metadata
      setElapsed(saved)
      readyRef.current = true
    }).catch(() => {
      accumulatedRef.current = 0
      setElapsed(0)
      readyRef.current = true
    })
  }, [docId])

  useEffect(() => {
    const tick = setInterval(() => {
      if (!activeRef.current || !readyRef.current) return
      const sessionMs = Date.now() - sessionStartRef.current
      setElapsed(accumulatedRef.current + sessionMs)
    }, 1000)
    return () => clearInterval(tick)
  }, [docId])

  useEffect(() => {
    const onBlur = () => {
      if (!activeRef.current) return
      activeRef.current = false
      accumulatedRef.current += Date.now() - sessionStartRef.current
      setElapsed(accumulatedRef.current)
    }
    const onFocus = () => {
      if (activeRef.current) return
      activeRef.current = true
      sessionStartRef.current = Date.now()
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [docId])

  const flush = useCallback(() => {
    if (!readyRef.current) return
    const total = activeRef.current
      ? accumulatedRef.current + (Date.now() - sessionStartRef.current)
      : accumulatedRef.current
    api.documents.update(docId, {
      metadata: { ...metadataRef.current, readingTimeMs: total },
    }).catch(() => {})
  }, [docId])

  useEffect(() => {
    const timer = setInterval(flush, 30000)
    return () => {
      clearInterval(timer)
      flush()
    }
  }, [flush])

  return { elapsed, formatted: formatTime(elapsed) }
}
