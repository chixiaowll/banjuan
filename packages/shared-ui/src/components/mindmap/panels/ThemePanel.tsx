import React from 'react'
import { THEMES } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import { useT } from '../../../i18n/index.js'

const EDGE_TYPE_KEYS = {
  bezier: 'mindmap.edgeBezier',
  straight: 'mindmap.edgeStraight',
  step: 'mindmap.edgeStep',
} as const

interface Props {
  onClose: () => void
}

export default function ThemePanel({ onClose }: Props) {
  const t = useT()
  const { theme: currentTheme, setTheme } = useMindmapStore()

  return (
    <div style={{ padding: '16px 16px 80px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{t('mindmap.themes')}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(THEMES).map(([key, th]) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 8, cursor: 'pointer',
              border: currentTheme === key ? '2px solid var(--accent, #4A90D9)' : '1px solid var(--border, #e0e0e0)',
              background: 'none',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: th.levels.root.fill,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: th.levels.root.color, fontSize: 11, fontWeight: 700,
            }}>
              Aa
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{th.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>
                {th.canvas.background === '#1E1E2E' ? t('mindmap.themeDark') : t('mindmap.themeLight')} · {t(EDGE_TYPE_KEYS[th.edges.type])}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
