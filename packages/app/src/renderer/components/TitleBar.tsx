import React from 'react'

export interface Tab {
  id: string
  type: 'library' | 'document' | 'note'
  title: string
  closable: boolean
}

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export default function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  return (
    <div className="title-bar">
      <div className="title-bar-drag" />
      <div className="title-bar-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`title-bar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="title-bar-tab-icon">
              {tab.type === 'library' ? '📚' : tab.type === 'document' ? '📄' : '📝'}
            </span>
            <span className="title-bar-tab-title">{tab.title}</span>
            {tab.closable && (
              <button
                className="title-bar-tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
