import React from 'react'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
import InkToolbarBase, { type InkToolbarAPI } from './InkToolbarBase.js'

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearAll: () => void
}

export default function MarkdownInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearAll }: Props) {
  const ctx = useMarkdownViewer()

  const api: InkToolbarAPI = {
    activeColor: ctx.inkColor,
    setActiveColor: ctx.setInkColor,
    inkWidth: ctx.inkWidth,
    setInkWidth: ctx.setInkWidth,
    isEraserActive: ctx.activeTool === 'eraser',
    setEraserActive: (v) => ctx.setActiveTool(v ? 'eraser' : 'ink'),
    isLassoActive: ctx.activeTool === 'lasso',
    setLassoActive: (v) => ctx.setActiveTool(v ? 'lasso' : 'ink'),
    ensureInkTool: () => { if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink') },
  }

  return (
    <InkToolbarBase
      api={api}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      onClear={onClearAll}
    />
  )
}
