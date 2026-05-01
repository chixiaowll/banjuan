import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function DocumentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.document
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <span>{nodeData.title}</span>
    </NodeShell>
  )
}
