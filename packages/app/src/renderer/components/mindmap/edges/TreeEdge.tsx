import React from 'react'
import { BaseEdge, getBezierPath, getStraightPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme, getEdgeStyleForLevel } from '../themes.js'

export default function TreeEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source } = props
  const { theme: themeName, rfNodes } = useMindmapStore()
  const theme = getTheme(themeName)

  const sourceNode = rfNodes.find(n => n.id === source)
  const depth = sourceNode?.data?.depth ?? 0
  const edgeStyle = getEdgeStyleForLevel(theme, depth)

  let path: string
  switch (theme.edges.type) {
    case 'straight': {
      const [p] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      path = p
      break
    }
    case 'step': {
      const [p] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 })
      path = p
      break
    }
    default: {
      const [p] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
      path = p
    }
  }

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: edgeStyle.color,
        strokeWidth: edgeStyle.width,
        fill: 'none',
        ...(edgeStyle.animated ? {
          strokeDasharray: '8 4',
          animation: 'mindmap-edge-flow 1s linear infinite',
        } : {}),
      }}
    />
  )
}
