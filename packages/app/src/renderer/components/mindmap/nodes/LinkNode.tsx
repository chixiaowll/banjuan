import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function LinkNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.link
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <div>
        <div>{nodeData.title}</div>
        {nodeData.hyperlink && (
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nodeData.hyperlink}
          </div>
        )}
      </div>
    </NodeShell>
  )
}
