import React from 'react'

interface HighlightRect {
  x: number
  y: number
  w: number
  h: number
}

interface Highlight {
  id: string
  color: string
  rects: HighlightRect[]
}

interface Props {
  highlights: Highlight[]
  scale: number
  onHighlightClick?: (id: string) => void
}

export default function HighlightLayer({ highlights, scale, onHighlightClick }: Props) {
  return (
    <>
      {highlights.map((hl) =>
        hl.rects.map((rect, i) => (
          <div
            key={`${hl.id}-${i}`}
            onClick={(e) => {
              e.stopPropagation()
              onHighlightClick?.(hl.id)
            }}
            style={{
              position: 'absolute',
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.w * scale,
              height: rect.h * scale,
              backgroundColor: hl.color,
              opacity: 0.35,
              mixBlendMode: 'multiply',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          />
        )),
      )}
    </>
  )
}
