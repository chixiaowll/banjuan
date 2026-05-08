import React, { useState, useCallback, useRef } from 'react'
import { useLongPress } from '../../hooks/useLongPress.js'
import { Plus, CopyPlus, LayoutTemplate, Trash2 } from 'lucide-react'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'
import type { HandwritingTemplate } from '@banjuan/core'

const TEMPLATES: HandwritingTemplate[] = ['blank', 'lined', 'grid', 'dotted', 'cornell']

interface ContextMenuState {
  x: number
  y: number
  pageIndex: number
}

export default function PageListPanel() {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const thumbnails = useHandwritingStore(s => s.thumbnails)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)
  const addPage = useHandwritingStore(s => s.addPage)
  const deletePage = useHandwritingStore(s => s.deletePage)
  const duplicatePage = useHandwritingStore(s => s.duplicatePage)
  const setPageTemplate = useHandwritingStore(s => s.setPageTemplate)
  const movePage = useHandwritingStore(s => s.movePage)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [templatePicker, setTemplatePicker] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, pageIndex: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pageIndex })
  }, [])

  const longPressPageRef = useRef<number | null>(null)
  const longPressHandlers = useLongPress(useCallback((e: React.PointerEvent) => {
    if (longPressPageRef.current !== null) {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, pageIndex: longPressPageRef.current })
    }
  }, []))

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndexRef.current !== null && dragIndexRef.current !== targetIndex) {
      movePage(dragIndexRef.current, targetIndex)
    }
    dragIndexRef.current = null
  }, [movePage])

  const ctxItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '6px 12px', border: 'none',
    background: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer',
    color: 'var(--text)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {pages.map((page, index) => (
          <div
            key={page.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            onClick={() => setCurrentPage(index)}
            onContextMenu={(e) => handleContextMenu(e, index)}
            onPointerDown={(e) => { longPressPageRef.current = index; longPressHandlers.onPointerDown(e) }}
            onPointerUp={longPressHandlers.onPointerUp}
            onPointerCancel={longPressHandlers.onPointerCancel}
            onPointerLeave={longPressHandlers.onPointerLeave}
            style={{
              padding: 6,
              marginBottom: 8,
              borderRadius: 6,
              border: index === currentPageIndex ? '2px solid var(--accent)' : '2px solid var(--border)',
              cursor: 'pointer',
              background: index === currentPageIndex ? 'var(--hover)' : 'transparent',
            }}
          >
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              background: 'white',
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {thumbnails.get(page.id) ? (
                <img src={thumbnails.get(page.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t(`handwriting.template.${page.template}`)}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => addPage(pages.length - 1)}
          style={{
            width: '100%', padding: '6px 0', border: '1px dashed var(--border)',
            borderRadius: 6, background: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} />{t('handwriting.newPage')}</span>
        </button>
      </div>

      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px 0', minWidth: 160,
          }}>
            <button style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { addPage(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <Plus size={14} />{t('handwriting.insertAfter')}
            </button>
            <button style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { duplicatePage(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <CopyPlus size={14} />{t('handwriting.duplicatePage')}
            </button>
            <button style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setTemplatePicker(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <LayoutTemplate size={14} />{t('handwriting.changeTemplate')}
            </button>
            {pages.length > 1 && (
              <button style={{ ...ctxItemStyle, color: '#e53e3e', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { deletePage(contextMenu.pageIndex); setContextMenu(null) }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Trash2 size={14} />{t('handwriting.deletePage')}
              </button>
            )}
          </div>
        </>
      )}

      {templatePicker !== null && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setTemplatePicker(null)} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: 16, minWidth: 240,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{t('handwriting.changeTemplate')}</div>
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl}
                onClick={() => { setPageTemplate(templatePicker, tmpl); setTemplatePicker(null) }}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', border: 'none',
                  background: pages[templatePicker]?.template === tmpl ? 'var(--hover)' : 'none',
                  textAlign: 'left', fontSize: 13, cursor: 'pointer', borderRadius: 4,
                  color: 'var(--text)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => {
                  if (pages[templatePicker]?.template !== tmpl) e.currentTarget.style.background = 'none'
                }}
              >
                {t(`handwriting.template.${tmpl}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
