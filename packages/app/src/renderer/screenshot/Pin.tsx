import React, { useEffect, useRef, useState } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { bridge } from './bridge.js'

/** A pinned screenshot: drag to move, wheel to zoom, double-click or Esc to close, right-click for copy / save / close. */
export default function Pin() {
  const t = useT()
  const [url, setUrl] = useState<string | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const off = bridge.onPinInit(({ png }) => setUrl(URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))))
    bridge.pinRequest()
    return off
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') bridge.pinClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!url) return null
  return (
    <img src={url} draggable={false}
      onLoad={e => { void e.currentTarget.decode().catch(() => {}).then(() => bridge.pinReady()) }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { x: e.screenX, y: e.screenY } }}
      onPointerMove={e => {
        if (!last.current || !e.buttons) return
        const dx = e.screenX - last.current.x, dy = e.screenY - last.current.y
        if (dx || dy) { bridge.pinMove(dx, dy); last.current = { x: e.screenX, y: e.screenY } }
      }}
      onPointerUp={() => { last.current = null }}
      onDoubleClick={() => bridge.pinClose()}
      onWheel={e => bridge.pinZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
      onContextMenu={e => {
        e.preventDefault()
        bridge.pinMenu({ copy: t('screenshot.pinCopy'), save: t('screenshot.save'), close: t('screenshot.pinClose'), fileNamePrefix: t('screenshot.fileName') })
      }}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block', cursor: 'move', userSelect: 'none' }} />
  )
}
