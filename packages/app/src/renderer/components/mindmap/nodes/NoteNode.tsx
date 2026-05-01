import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.note
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <div>
        <div style={{ fontWeight: 600 }}>{nodeData.title}</div>
        {nodeData.content && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nodeData.content}
          </div>
        )}
      </div>
    </NodeShell>
  )
}
