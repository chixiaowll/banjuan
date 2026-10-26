import React from 'react'
import { BaseEdge, getStraightPath, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme, getEdgeStyleForLevel } from '../themes.js'

function getMindmapBezierPath(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  vertical = false,
): string {
  if (vertical) {   // organization chart: leave downward, arrive from above
    const dy = targetY - sourceY
    const cp = Math.min(Math.abs(dy) * 0.5, 60)
    return `M ${sourceX},${sourceY} C ${sourceX},${sourceY + cp} ${targetX},${targetY - cp} ${targetX},${targetY}`
  }
  const dx = targetX - sourceX
  const cpOffset = Math.min(Math.abs(dx) * 0.4, 80)
  const cp1x = sourceX + Math.sign(dx) * cpOffset
  const cp2x = targetX - Math.sign(dx) * cpOffset
  return `M ${sourceX},${sourceY} C ${cp1x},${sourceY} ${cp2x},${targetY} ${targetX},${targetY}`
}

export default function TreeEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source } = props
  const themeName = useMindmapStore(s => s.theme)
  const depth = useMindmapStore(s => (s.rfNodes.find(n => n.id === source)?.data?.depth as number | undefined) ?? 0)
  const theme = getTheme(themeName)
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
      path = getMindmapBezierPath(sourceX, sourceY, targetX, targetY, sourcePosition === Position.Bottom)
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
