import React, { useRef, useEffect, useState, useCallback } from 'react'
import { X, Library, FileText, StickyNote, Tag, Puzzle, PanelRight, Camera } from 'lucide-react'
import { useTheme } from '../theme/index.js'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'

export interface Tab {
  id: string
  type: 'library' | 'document' | 'note' | 'tag-manager' | 'plugin'
  title: string
  closable: boolean
}

export interface PluginViewInfo {
  viewType: string
  pluginId: string
  displayText: string
  icon?: string
  singleton?: boolean
}

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onReorderTabs?: (tabs: Tab[]) => void
  pluginViews?: PluginViewInfo[]
  activePanelPlugin?: string | null
  onTogglePluginPanel?: (pluginId: string, viewType: string) => void
  /** whether the right rail has anything to show (else the toggle is hidden) */
  railRelevant?: boolean
  railCollapsed?: boolean
  onToggleRail?: () => void
}

export default function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab, onReorderTabs, pluginViews, activePanelPlugin, onTogglePluginPanel, railRelevant, railCollapsed, onToggleRail }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const { theme: appTheme } = useTheme()
  const isNotebook = appTheme === 'notebook'
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRects = useRef<Map<string, DOMRect>>(new Map())
  const [dragState, setDragState] = useState<{
    tabId: string
    startX: number
    offsetX: number
    order: string[]
  } | null>(null)

  useEffect(() => {
    const el = tabsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [tabs.length])

  const measureTabs = useCallback(() => {
    const container = tabsRef.current
    if (!container) return
    tabRects.current.clear()
    const children = container.children
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement
      const id = el.dataset.tabId
      if (id) tabRects.current.set(id, el.getBoundingClientRect())
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent, tab: Tab) => {
    if (!onReorderTabs) return
    if ((e.target as HTMLElement).closest('.title-bar-tab-close')) return
    e.preventDefault()
    measureTabs()
    const order = tabs.map(t => t.id)
    setDragState({ tabId: tab.id, startX: e.clientX, offsetX: 0, order })

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX
      setDragState(prev => {
        if (!prev) return null
        const origOrder = tabs.map(t => t.id)
        const dragIdx = origOrder.indexOf(prev.tabId)
        const newOrder = [...origOrder]

        const dragRect = tabRects.current.get(prev.tabId)
        if (!dragRect) return { ...prev, offsetX: dx }

        const dragLeft = dragRect.left + dx
        const dragRight = dragLeft + dragRect.width

        let targetIdx = dragIdx
        for (let i = 0; i < origOrder.length; i++) {
          if (i === dragIdx) continue
          const rect = tabRects.current.get(origOrder[i])
          if (!rect) continue
          const center = rect.left + rect.width / 2
          if (dragIdx < i && dragRight > center) targetIdx = i
          if (dragIdx > i && dragLeft < center && (targetIdx === dragIdx || i < targetIdx)) targetIdx = i
        }

        if (targetIdx !== dragIdx) {
          newOrder.splice(dragIdx, 1)
          newOrder.splice(targetIdx, 0, prev.tabId)
        }

        return { ...prev, offsetX: dx, order: newOrder }
      })
    }

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragState(prev => {
        if (prev && onReorderTabs) {
          const reordered = prev.order.map(id => tabs.find(t => t.id === id)!).filter(Boolean)
          if (reordered.length === tabs.length) {
            onReorderTabs(reordered)
          }
        }
        return null
      })
    }

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }, [tabs, onReorderTabs, measureTabs])

  const getTabStyle = (tab: Tab): React.CSSProperties => {
    if (!dragState) return {}
    const origOrder = tabs.map(t => t.id)
    const origIdx = origOrder.indexOf(tab.id)
    const newIdx = dragState.order.indexOf(tab.id)

    if (tab.id === dragState.tabId) {
      return {
        transform: `translateX(${dragState.offsetX}px)`,
        zIndex: 10,
        opacity: 0.9,
        transition: 'none',
      }
    }

    if (origIdx !== newIdx) {
      const dragRect = tabRects.current.get(dragState.tabId)
      const myRect = tabRects.current.get(tab.id)
      if (dragRect && myRect) {
        const shift = newIdx < origIdx
          ? -dragRect.width
          : dragRect.width
        return {
          transform: `translateX(${shift}px)`,
          transition: 'transform 0.2s ease',
        }
      }
    }

    return { transition: 'transform 0.2s ease', transform: 'translateX(0)' }
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag" />
      <div className="title-bar-spacer" />
      <div className="title-bar-tabs" ref={tabsRef}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`title-bar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            title={tab.title}
            onClick={() => { if (!dragState) onSelectTab(tab.id) }}
            onPointerDown={(e) => handlePointerDown(e, tab)}
            style={{
              cursor: dragState?.tabId === tab.id ? 'grabbing' : 'grab',
              ...getTabStyle(tab),
            }}
          >
            <span className="title-bar-tab-icon">
              {tab.type === 'library' ? (
                <span style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: isNotebook ? '#E07856' : 'var(--ink)', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-serif, "Noto Serif SC", serif)',
                  fontSize: 11, fontWeight: 600,
                  boxShadow: isNotebook ? '0 1px 3px rgba(224,120,86,.3)' : 'none',
                }}>藏</span>
              ) : isNotebook ? (
                tab.type === 'document' ? '📄' : tab.type === 'tag-manager' ? '🏷' : tab.type === 'plugin' ? '🧩' : '📝'
              ) : (
                tab.type === 'document' ? <FileText size={14} /> : tab.type === 'tag-manager' ? <Tag size={14} /> : tab.type === 'plugin' ? <Puzzle size={14} /> : <StickyNote size={14} />
              )}
            </span>
            <span className="title-bar-tab-title">{tab.title}</span>
            {tab.closable && (
              <button
                className="title-bar-tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                title="Close"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {api.screenshot && (
          <button
            onClick={() => api.screenshot!.trigger()}
            title={t('screenshot.button')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              marginLeft: 'auto', alignSelf: 'center', // anchors the right-side control group
              color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center',
              ['WebkitAppRegion' as any]: 'no-drag',
            }}
          >
            <Camera size={16} />
          </button>
        )}
      {/* Plugin launchers live in the window-level right rail (TabManager). This
          toggle shows/hides that rail so the layout isn't lopsided when unused. */}
      {railRelevant && onToggleRail && (
        <button
          className="title-bar-rail-toggle"
          onClick={onToggleRail}
          title={railCollapsed ? '显示工具栏' : '隐藏工具栏'}
          aria-pressed={!railCollapsed}
          style={{
            background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px',
            marginLeft: api.screenshot ? 0 : 'auto', marginRight: 12, alignSelf: 'center',
            color: railCollapsed ? 'var(--text-muted)' : 'var(--accent)',
            display: 'inline-flex', alignItems: 'center',
            position: 'relative', zIndex: 5,
            ['WebkitAppRegion' as any]: 'no-drag', // clickable over the title-bar drag region
          }}
        >
          <PanelRight size={16} />
        </button>
      )}
    </div>
  )
}
