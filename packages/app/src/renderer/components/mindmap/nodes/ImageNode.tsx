import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function ImageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { borderRadius, maxWidth } = theme.nodeTypeStyles.image
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected}>
      <div>
        {nodeData.imageUrl && (
          <img
            src={nodeData.imageUrl}
            alt={nodeData.title}
            style={{ maxWidth, borderRadius, display: 'block' }}
          />
        )}
        {nodeData.title && <div style={{ marginTop: 4, fontSize: 12 }}>{nodeData.title}</div>}
      </div>
    </NodeShell>
  )
}
