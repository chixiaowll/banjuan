import React from 'react'
import { useStore } from '@xyflow/react'

export default function ViewportOverlay({ children }: { children: React.ReactNode }) {
  const transform = useStore(s => s.transform)
  const [x, y, zoom] = transform

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  )
}
