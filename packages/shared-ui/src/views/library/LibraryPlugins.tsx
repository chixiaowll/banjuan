import { useLibrary } from './LibraryContext.js'

/** The plugins section: installed plugins, enabling them, opening their views. */
export default function LibraryPlugins() {
  const {
    api, layout, loadPlugins, onOpenPluginView, pluginIconCache, pluginViews, plugins, t,
  } = useLibrary()
  return (
    <div style={{ padding: '24px 28px 80px', overflow: 'auto', flex: 1 }}>
      <div style={layout.contentMaxWidth ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', padding: '12px 20px' } : {}}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {plugins.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>
            {t('library.noPlugins')}
          </div>
        )}
        {plugins.map((p) => {
          const pIcon = pluginViews.find(v => v.pluginId === p.id)?.icon || pluginIconCache.current.get(p.id)
          const isSvg = pIcon && pIcon.includes('<svg')
          const views = pluginViews.filter(v => v.pluginId === p.id)
          return (
            <div key={p.id} style={{
              background: 'var(--surface-raised, #fff)',
              borderRadius: 8,
              border: '1px solid #dadce0',
              boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Top: icon + info */}
              <div style={{ padding: '20px 20px 0', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 56, height: 56, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSvg ? (
                    <span dangerouslySetInnerHTML={{ __html: pIcon!.replace(/width="18"/, 'width="40"').replace(/height="18"/, 'height="40"') }} />
                  ) : (
                    <span style={{ fontSize: 36 }}>{pIcon || '🧩'}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.version}</span>
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4 }}>{p.description}</div>
                  )}
                  {p.source === 'library' && p.trusted === false && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>{t('plugin.untrustedLibrary')}</div>
                  )}
                </div>
              </div>
              {/* Spacer */}
              <div style={{ flex: 1 }} />
              {/* Bottom: actions + toggle */}
              <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {p.enabled && views.map(view => (
                    <button
                      key={view.viewType}
                      onClick={() => onOpenPluginView?.(view.pluginId, view.viewType)}
                      style={{
                        background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)',
                        borderRadius: 16, padding: '4px 16px', fontSize: 13, fontWeight: 500,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {t('plugin.openPanel')}
                    </button>
                  ))}
                </div>
                <div
                  onClick={async () => {
                    if (p.enabled) {
                      await api.plugins!.disable(p.id)
                    } else {
                      await api.plugins!.enable(p.id)
                    }
                    await loadPlugins()
                    document.dispatchEvent(new CustomEvent('plugins-changed'))
                  }}
                  style={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                    background: p.enabled ? '#1a73e8' : '#dadce0',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 9,
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    position: 'absolute', top: 2,
                    left: p.enabled ? 20 : 2,
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
