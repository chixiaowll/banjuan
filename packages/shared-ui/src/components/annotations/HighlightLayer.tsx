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
        hl.rects.map((rect, i) => {
          // Rects with all values in [0, 1] are page-fraction coords (new format).
          // Render using percentages so they auto-scale with zoom changes.
          const isFraction = rect.x <= 1 && rect.y <= 1 && rect.w <= 1 && rect.h <= 1
          const style: React.CSSProperties = isFraction
            ? {
                position: 'absolute',
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }
            : {
                position: 'absolute',
                left: rect.x * scale,
                top: rect.y * scale,
                width: rect.w * scale,
                height: rect.h * scale,
              }
          return (
            <div
              key={`${hl.id}-${i}`}
              style={{
                ...style,
                backgroundColor: hl.color,
                opacity: 0.35,
                mixBlendMode: 'multiply',
                pointerEvents: 'none',
              }}
            />
          )
        }),
      )}
    </>
  )
}
