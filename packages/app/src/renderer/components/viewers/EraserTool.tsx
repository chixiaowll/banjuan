import React, { useState } from 'react'

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
  type: string
}

interface Props {
  active: boolean
  annotations: AnnotationData[]
  pageNum: number
  onDelete: (id: string) => void
}

export default function EraserTool({ active, annotations, pageNum, onDelete }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  if (!active) return null

  const pageAnnotations = annotations.filter(a => a.page === pageNum)

  return (
    <div style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 10 }}>
      {pageAnnotations.map(ann => {
        const pos = ann.position
        if (!pos) return null
        let overlayStyle: React.CSSProperties = { position: 'absolute' }
        if (pos.type === 'pdf' && pos.rects?.[0]) {
          const r = pos.rects[0]
          Object.assign(overlayStyle, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` })
        } else if (pos.type === 'point') {
          Object.assign(overlayStyle, { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: 24, height: 24, transform: 'translate(-50%, -50%)' })
        } else if (pos.type === 'area' && pos.rect) {
          Object.assign(overlayStyle, { left: `${pos.rect.x * 100}%`, top: `${pos.rect.y * 100}%`, width: `${pos.rect.w * 100}%`, height: `${pos.rect.h * 100}%` })
        } else if (pos.type === 'ink' && pos.bounds) {
          Object.assign(overlayStyle, { left: `${pos.bounds.x * 100}%`, top: `${pos.bounds.y * 100}%`, width: `${pos.bounds.w * 100}%`, height: `${pos.bounds.h * 100}%` })
        } else {
          return null
        }
        return (
          <div key={ann.id} style={{
            ...overlayStyle,
            background: hoverId === ann.id ? 'rgba(255, 0, 0, 0.25)' : 'transparent',
            border: hoverId === ann.id ? '2px solid rgba(255, 0, 0, 0.5)' : 'none',
            borderRadius: 2, cursor: 'pointer',
          }}
            onMouseEnter={() => setHoverId(ann.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={(e) => { e.stopPropagation(); onDelete(ann.id) }}
          />
        )
      })}
    </div>
  )
}
