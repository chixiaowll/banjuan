import React, { useState, useRef, useCallback } from 'react'

export function useResizable(initialWidth: number, minWidth: number, maxWidth: number, side: 'left' | 'right') {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const delta = side === 'left' ? ev.clientX - startX.current : startX.current - ev.clientX
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onPointerUp = () => {
      dragging.current = false
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width, minWidth, maxWidth, side])

  return { width, onPointerDown }
}

export function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        width: 1, flexShrink: 0, cursor: 'col-resize',
        background: hovered ? 'var(--accent)' : 'var(--border)',
        transition: 'background 0.15s',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: -3, right: -3,
      }} />
    </div>
  )
}
