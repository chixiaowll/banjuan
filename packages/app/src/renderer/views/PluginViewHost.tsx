import React, { useEffect, useRef, useState } from 'react'

interface Props {
  pluginId: string
  viewType: string
}

export default function PluginViewHost({ pluginId, viewType }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    let blobUrl: string | null = null

    async function init() {
      try {
        const source = await window.electronAPI.plugins.getRendererSource(pluginId)
        if (cancelled) return

        if (!source) {
          setError(`Plugin "${pluginId}" has no renderer.js`)
          return
        }

        const blob = new Blob([source], { type: 'application/javascript' })
        blobUrl = URL.createObjectURL(blob)
        const mod = await import(/* @vite-ignore */ blobUrl)
        if (cancelled) return

        const api = {
          pluginId,
          viewType,
          containerEl: el,
          rpc: (method: string, ...args: any[]) =>
            window.electronAPI.plugins.rpc(pluginId, method, args),
          onMessage: (channel: string, handler: (data: any) => void) =>
            window.electronAPI.plugins.onMessage(`plugin:${pluginId}:${channel}`, handler),
          openView: (vt: string, opts?: { singleton?: boolean }) => {
            document.dispatchEvent(new CustomEvent('plugin:open-view', { detail: { viewType: vt, ...opts } }))
          },
          getContext: () => (window as any).__banjuanContext || {},
        }

        if (typeof mod.activate === 'function') {
          const result = mod.activate(api)
          if (result && typeof result.cleanup === 'function') {
            cleanupRef.current = result.cleanup
          }
        } else if (typeof mod.default === 'function') {
          mod.default(api)
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load plugin view')
      }
    }

    init()

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      if (el) el.innerHTML = ''
    }
  }, [pluginId, viewType])

  useEffect(() => {
    let styleEl: HTMLStyleElement | null = null

    const loadCss = async () => {
      const css = await window.electronAPI.plugins.getCssSource(pluginId)
      if (!css) return
      const existing = document.getElementById(`plugin-css-${pluginId}`)
      if (existing) return
      styleEl = document.createElement('style')
      styleEl.id = `plugin-css-${pluginId}`
      styleEl.textContent = css
      document.head.appendChild(styleEl)
    }
    loadCss()

    return () => {
      styleEl?.remove()
      document.getElementById(`plugin-css-${pluginId}`)?.remove()
    }
  }, [pluginId])

  if (error) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
        <p>Plugin view failed to load:</p>
        <pre style={{ color: '#c44040', fontSize: 12 }}>{error}</pre>
      </div>
    )
  }

  return <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
}
