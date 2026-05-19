import React, { useRef, useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'

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
}

export default function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab, onReorderTabs, pluginViews, activePanelPlugin, onTogglePluginPanel }: Props) {
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
              {tab.type === 'library' ? '📚' : tab.type === 'document' ? '📄' : tab.type === 'tag-manager' ? '🏷' : tab.type === 'plugin' ? '🧩' : '📝'}
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
      {pluginViews && pluginViews.length > 0 && (
        <div className="title-bar-plugins">
          {pluginViews.map(pv => (
            <button
              key={pv.pluginId}
              className={`title-bar-plugin-btn ${activePanelPlugin === pv.pluginId ? 'active' : ''}`}
              title={pv.displayText}
              onClick={() => onTogglePluginPanel?.(pv.pluginId, pv.viewType)}
            >
              {pv.icon && pv.icon.includes('<svg') ? (
                <span dangerouslySetInnerHTML={{ __html: pv.icon }} />
              ) : (
                <span>{pv.icon || '🧩'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
