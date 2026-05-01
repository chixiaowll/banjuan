import React from 'react'
import { BaseEdge, getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'

export default function RelationEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const { theme: themeName } = useMindmapStore()
  const theme = getTheme(themeName)

  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const label = (data as any)?.label

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: theme.relation.color,
          strokeWidth: theme.relation.width,
          strokeDasharray: theme.relation.dasharray,
          fill: 'none',
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              font: theme.relation.labelFont,
              color: theme.relation.color,
              background: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
