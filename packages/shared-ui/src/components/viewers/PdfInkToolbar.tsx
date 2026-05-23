import React from 'react'
import { usePdfViewer } from './PdfViewerContext.js'
import InkToolbarBase, { type InkToolbarAPI } from './InkToolbarBase.js'

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearPage: () => void
}

export default function PdfInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearPage }: Props) {
  const ctx = usePdfViewer()

  const api: InkToolbarAPI = {
    activeColor: ctx.activeColor,
    setActiveColor: ctx.setActiveColor,
    inkWidth: ctx.inkWidth,
    setInkWidth: ctx.setInkWidth,
    isEraserActive: ctx.inkEraserActive,
    setEraserActive: (v) => ctx.setInkEraserActive(v),
    isLassoActive: ctx.activeTool === 'lasso',
    setLassoActive: (v) => ctx.setActiveTool(v ? 'lasso' : 'ink'),
    ensureInkTool: () => { if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink') },
    annotationsVisible: ctx.annotationsVisible,
    toggleAnnotationsVisible: () => ctx.setAnnotationsVisible(!ctx.annotationsVisible),
  }

  return (
    <InkToolbarBase
      api={api}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      onClear={onClearPage}
    />
  )
}
