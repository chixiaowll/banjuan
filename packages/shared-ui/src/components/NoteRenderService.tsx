import { useEffect, useState, useCallback, useRef } from 'react'
import { useBanjuanAPI } from '../api.js'

interface RenderRequest {
  noteId: string
  requestId: string
}

export default function NoteRenderService() {
  const api = useBanjuanAPI()
  const [request, setRequest] = useState<RenderRequest | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = api.noteRender!.onRequest((noteId, requestId) => {
      setRequest({ noteId, requestId })
    })
    return unsub
  }, [])

  const handleRendered = useCallback(async () => {
    if (!request || !containerRef.current) return
    try {
      const note = await api.notes.get(request.noteId)
      if (!note) {
        api.noteRender!.sendResult(request.requestId, null)
        setRequest(null)
        return
      }

      if (note.type === 'handwriting') {
        const dataUrl = await renderHandwriting(note)
        api.noteRender!.sendResult(request.requestId, dataUrl)
      } else if (note.type === 'mindmap') {
        const dataUrl = await renderMindmap(note, containerRef.current)
        api.noteRender!.sendResult(request.requestId, dataUrl)
      } else {
        const dataUrl = await renderMarkdownNote(note, containerRef.current)
        api.noteRender!.sendResult(request.requestId, dataUrl)
      }
    } catch {
      api.noteRender!.sendResult(request.requestId, null)
    }
    setRequest(null)
  }, [request])

  useEffect(() => {
    if (request) {
      const timer = setTimeout(handleRendered, 100)
      return () => clearTimeout(timer)
    }
  }, [request, handleRendered])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', left: -9999, top: -9999,
        width: 800, overflow: 'hidden', background: '#fff',
      }}
    />
  )
}

async function renderHandwriting(note: any): Promise<string | null> {
  try {
    const data = JSON.parse(note.content)
    const pages = data.pages || []
    if (pages.length === 0) return null
    const page = pages[data.currentPageIndex] || pages[0]
    const pageSize = data.pageSize || { width: 1024, height: 768 }
    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = pageSize.width * dpr
    canvas.height = pageSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    const { renderAllStrokes } = await import('./handwriting/renderStrokes.js')
    renderAllStrokes(ctx, page.snapshot?.strokes || [], pageSize.width, pageSize.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

async function renderMindmap(note: any, container: HTMLDivElement): Promise<string | null> {
  try {
    const data = JSON.parse(note.content)
    const nodes = data.nodes || []
    const edges = data.edges || []
    if (nodes.length === 0) return null

    const minX = Math.min(...nodes.map((n: any) => n.position?.x ?? n.positionX ?? 0))
    const minY = Math.min(...nodes.map((n: any) => n.position?.y ?? n.positionY ?? 0))
    const maxX = Math.max(...nodes.map((n: any) => (n.position?.x ?? n.positionX ?? 0) + 200))
    const maxY = Math.max(...nodes.map((n: any) => (n.position?.y ?? n.positionY ?? 0) + 60))
    const w = maxX - minX + 80
    const h = maxY - minY + 80

    const canvas = document.createElement('canvas')
    const dpr = 2
    canvas.width = Math.min(w * dpr, 4000)
    canvas.height = Math.min(h * dpr, 4000)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    const offsetX = -minX + 40
    const offsetY = -minY + 40

    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1.5
    for (const e of edges) {
      const src = nodes.find((n: any) => n.id === (e.source || e.sourceId))
      const tgt = nodes.find((n: any) => n.id === (e.target || e.targetId))
      if (!src || !tgt) continue
      const sx = (src.position?.x ?? src.positionX ?? 0) + offsetX + 100
      const sy = (src.position?.y ?? src.positionY ?? 0) + offsetY + 30
      const tx = (tgt.position?.x ?? tgt.positionX ?? 0) + offsetX + 100
      const ty = (tgt.position?.y ?? tgt.positionY ?? 0) + offsetY + 30
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
    }

    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const n of nodes) {
      const x = (n.position?.x ?? n.positionX ?? 0) + offsetX
      const y = (n.position?.y ?? n.positionY ?? 0) + offsetY
      const label = n.data?.label || n.title || n.content || ''
      ctx.fillStyle = n.data?.color || n.color || '#e8edf3'
      ctx.beginPath()
      ctx.roundRect(x, y, 200, 40, 8)
      ctx.fill()
      ctx.strokeStyle = '#c0c8d4'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#333'
      ctx.fillText(label.slice(0, 30), x + 100, y + 20)
    }

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

async function renderMarkdownNote(note: any, container: HTMLDivElement): Promise<string | null> {
  try {
    const blocks = JSON.parse(note.content)
    const html = blocksToHtml(blocks)
    container.innerHTML = `<div style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.6;color:#333"><h1 style="font-size:20px;margin:0 0 16px">${escHtml(note.title)}</h1>${html}</div>`
    container.style.left = '-9999px'
    container.style.width = '800px'

    await new Promise(r => setTimeout(r, 50))

    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(container, { backgroundColor: '#ffffff', pixelRatio: 2 })
    container.innerHTML = ''
    return dataUrl
  } catch {
    container.innerHTML = ''
    return null
  }
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function blocksToHtml(blocks: any[]): string {
  if (!Array.isArray(blocks)) return ''
  return blocks.map(b => {
    const text = inlineHtml(b.content)
    switch (b.type) {
      case 'heading': {
        const lvl = b.props?.level || 1
        return `<h${lvl + 1}>${text}</h${lvl + 1}>`
      }
      case 'bulletListItem': return `<ul><li>${text}</li></ul>`
      case 'numberedListItem': return `<ol><li>${text}</li></ol>`
      case 'codeBlock': return `<pre style="background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px"><code>${escHtml(text)}</code></pre>`
      case 'image': return `<img src="${b.props?.url || ''}" style="max-width:100%" />`
      default: return text ? `<p>${text}</p>` : ''
    }
  }).join('')
}

function inlineHtml(content: any): string {
  if (!content) return ''
  if (typeof content === 'string') return escHtml(content)
  if (!Array.isArray(content)) return ''
  return content.map((c: any) => {
    if (typeof c === 'string') return escHtml(c)
    if (c.type === 'text') {
      let t = escHtml(c.text || '')
      if (c.styles?.bold) t = `<strong>${t}</strong>`
      if (c.styles?.italic) t = `<em>${t}</em>`
      if (c.styles?.code) t = `<code>${t}</code>`
      return t
    }
    if (c.type === 'link') return `<a href="${c.href || ''}">${inlineHtml(c.content)}</a>`
    return escHtml(c.text || '')
  }).join('')
}
