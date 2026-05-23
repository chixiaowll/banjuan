import React, { useRef, useCallback, useSyncExternalStore } from 'react'

export function useResizable(initialWidth: number, minWidth: number, maxWidth: number, side: 'left' | 'right') {
  const widthRef = useRef(initialWidth)
  const listeners = useRef(new Set<() => void>())
  const subscribe = useCallback((cb: () => void) => { listeners.current.add(cb); return () => { listeners.current.delete(cb) } }, [])
  const getSnapshot = useCallback(() => widthRef.current, [])
  const width = useSyncExternalStore(subscribe, getSnapshot)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    let rafId = 0

    const onPointerMove = (ev: PointerEvent) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX
        const next = Math.min(maxWidth, Math.max(minWidth, startW + delta))
        if (next !== widthRef.current) {
          widthRef.current = next
          listeners.current.forEach(cb => cb())
        }
      })
    }

    const onPointerUp = () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [minWidth, maxWidth, side])

  return { width, onPointerDown }
}

export function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  const hoverRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={hoverRef}
      onPointerDown={onPointerDown}
      onPointerEnter={() => { if (hoverRef.current) hoverRef.current.style.background = 'var(--accent)' }}
      onPointerLeave={() => { if (hoverRef.current) hoverRef.current.style.background = 'var(--border)' }}
      style={{
        width: 1, flexShrink: 0, cursor: 'col-resize',
        background: 'var(--border)',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: -3, right: -3,
      }} />
    </div>
  )
}
