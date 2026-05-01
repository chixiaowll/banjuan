import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function AnnotationNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.annotation
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <span style={{ fontStyle: 'italic' }}>{nodeData.title}</span>
    </NodeShell>
  )
}
