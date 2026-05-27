import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function ViewportOverlay({ children }: { children: React.ReactNode }) {
  const markerRef = useRef<HTMLSpanElement>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const canvas = markerRef.current?.closest('.mindmap-canvas')
    if (!canvas) return
    const vp = canvas.querySelector(':scope > .react-flow .react-flow__viewport') as HTMLElement | null
    if (vp) { setTarget(vp); return }
    const obs = new MutationObserver(() => {
      const found = canvas.querySelector(':scope > .react-flow .react-flow__viewport') as HTMLElement | null
      if (found) { setTarget(found); obs.disconnect() }
    })
    obs.observe(canvas, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  if (!target) return <span ref={markerRef} style={{ display: 'none' }} />

  return (
    <>
      <span ref={markerRef} style={{ display: 'none' }} />
      {createPortal(
        <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: 5 }}>
          {children}
        </div>,
        target,
      )}
    </>
  )
}
