import React from 'react'
import { BaseEdge, getStraightPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme, getEdgeStyleForLevel } from '../themes.js'

function getMindmapBezierPath(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
): string {
  const dx = targetX - sourceX
  const cpOffset = Math.min(Math.abs(dx) * 0.4, 80)
  const cp1x = sourceX + Math.sign(dx) * cpOffset
  const cp2x = targetX - Math.sign(dx) * cpOffset
  return `M ${sourceX},${sourceY} C ${cp1x},${sourceY} ${cp2x},${targetY} ${targetX},${targetY}`
}

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
      path = getMindmapBezierPath(sourceX, sourceY, targetX, targetY)
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
