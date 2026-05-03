import React, { useEffect, useRef, useCallback } from 'react'
import { Tldraw, useEditor, getSnapshot, loadSnapshot, createTLStore, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import TemplateRenderer from './TemplateRenderer.js'
import HandwritingToolbar from './HandwritingToolbar.js'
import type { HandwritingTemplate } from '@banjuan/core'

interface Props {
  pageId: string
  snapshot: unknown
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
  onSnapshotChange: (snapshot: unknown) => void
  onThumbnailGenerated: (dataUrl: string) => void
}

function CameraSetup({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const editor = useEditor()

  useEffect(() => {
    editor.setCameraOptions({
      constraints: {
        bounds: { x: 0, y: 0, w: pageWidth, h: pageHeight },
        padding: { x: 16, y: 16 },
        origin: { x: 0.5, y: 0.5 },
        initialZoom: 'fit-min',
        baseZoom: 'fit-min',
        behavior: 'inside',
      },
    })
    editor.setCamera(editor.getCamera(), { reset: true })
  }, [editor, pageWidth, pageHeight])

  return null
}

function AutoSave({ onSnapshotChange, onThumbnailGenerated }: {
  onSnapshotChange: (snapshot: unknown) => void
  onThumbnailGenerated: (dataUrl: string) => void
}) {
  const editor = useEditor()

  useEffect(() => {
    const cleanup = editor.store.listen(
      () => {
        const { document } = getSnapshot(editor.store)
        onSnapshotChange(document)
      },
      { source: 'user', scope: 'document' }
    )
    return cleanup
  }, [editor, onSnapshotChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = editor.store.listen(
      () => {
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            const shapeIds = editor.getCurrentPageShapeIds()
            if (shapeIds.size === 0) {
              onThumbnailGenerated('')
              return
            }
            const result = await editor.toImage(shapeIds, {
              format: 'png',
              pixelRatio: 0.25,
              background: false,
            })
            if (result) {
              const url = URL.createObjectURL(result.blob)
              onThumbnailGenerated(url)
            }
          } catch { /* ignore thumbnail errors */ }
        }, 1000)
      },
      { source: 'user', scope: 'document' }
    )
    return () => { cleanup(); clearTimeout(timer) }
  }, [editor, onThumbnailGenerated])

  return null
}

function InternalToolbar() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 300 }}>
      <HandwritingToolbar />
    </div>
  )
}

export default function HandwritingEditor({
  pageId, snapshot, template, pageWidth, pageHeight, onSnapshotChange, onThumbnailGenerated,
}: Props) {
  const storeRef = useRef<ReturnType<typeof createTLStore>>()

  if (!storeRef.current) {
    storeRef.current = createTLStore()
  }

  useEffect(() => {
    if (snapshot && storeRef.current) {
      loadSnapshot(storeRef.current, { document: snapshot as any })
    }
  }, [pageId])

  const components: TLComponents = {
    Background: () => (
      <TemplateRenderer template={template} pageWidth={pageWidth} pageHeight={pageHeight} />
    ),
    HelpMenu: null,
    DebugMenu: null,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Tldraw
        key={pageId}
        store={storeRef.current}
        components={components}
        autoFocus
      >
        <CameraSetup pageWidth={pageWidth} pageHeight={pageHeight} />
        <AutoSave onSnapshotChange={onSnapshotChange} onThumbnailGenerated={onThumbnailGenerated} />
        <InternalToolbar />
      </Tldraw>
    </div>
  )
}
