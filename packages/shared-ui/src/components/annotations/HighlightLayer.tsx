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
  type?: string
  rects: HighlightRect[]
}

interface Props {
  highlights: Highlight[]
  scale: number
  onHighlightClick?: (id: string) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}

export default function HighlightLayer({ highlights, scale, onHighlightClick, onContextMenu }: Props) {
  return (
    <>
      {highlights.map((hl) =>
        hl.rects.map((rect, i) => {
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
          const isUnderline = hl.type === 'underline'
          return (
            <div
              key={`${hl.id}-${i}`}
              onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(e, hl.id) } }}
              onClick={(e) => { if (onHighlightClick) { e.stopPropagation(); onHighlightClick(hl.id) } }}
              style={{
                ...style,
                backgroundColor: isUnderline ? 'transparent' : hl.color,
                borderBottom: isUnderline ? `2px solid ${hl.color}` : 'none',
                opacity: isUnderline ? 1 : 0.35,
                mixBlendMode: isUnderline ? 'normal' : 'multiply',
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
            />
          )
        }),
      )}
    </>
  )
}
