import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function TextNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected}>
      <span>{nodeData.title}</span>
    </NodeShell>
  )
}
