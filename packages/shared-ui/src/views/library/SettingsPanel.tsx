import React, { useCallback } from 'react'
import { ScreenshotHotkeySetting } from '../../components/ScreenshotHotkeySetting.js'
import { DockSetting } from '../../components/DockSetting.js'
import { getStoredNoteTheme, applyNoteTheme, NOTE_THEME_KEYS, NOTE_THEMES } from '../../components/notes/noteThemes.js'
import type { Locale, MessageKey } from '../../i18n/index.js'
import { useTheme, APP_THEMES } from '../../theme/index.js'
import { useBanjuanAPI } from '../../api.js'
import { alertDialog, toast, confirmDialog } from '../../components/feedback.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'

export default function SettingsPanel({ locale, setLocale, t }: { locale: string; setLocale: (l: Locale) => void; t: (key: MessageKey, ...args: Array<string | number>) => string }) {
  const { theme: appTheme, setTheme: setAppTheme } = useTheme()
  const [noteTheme, setNoteTheme] = React.useState(getStoredNoteTheme)

  const handleThemeChange = useCallback((key: string) => {
    applyNoteTheme(key)
    setNoteTheme(key)
  }, [])

  const api = useBanjuanAPI()
  const [rebuilding, setRebuilding] = React.useState(false)
  const [missingDocs, setMissingDocs] = React.useState<Array<{ id: string; title: string; path: string }> | null>(null)
  useEscapeKey(!!missingDocs, () => setMissingDocs(null))
  const [purgeSel, setPurgeSel] = React.useState<Set<string>>(new Set())

  const runRebuild = useCallback(async (purgeIds: string[]) => {
    setMissingDocs(null)
    setRebuilding(true)
    try {
      const r = await api.library.rebuild?.(purgeIds)
      await alertDialog({ message: t('settings.rebuildDone', r?.reimported ?? 0, r?.purged ?? 0, r?.markedMissing ?? 0) })
      window.location.reload()
    } catch (e) {
      toast.error(t('settings.rebuildFailed', String(e)))
      setRebuilding(false)
    }
  }, [api, t])

  const startRebuild = useCallback(async () => {
    if (!await confirmDialog({ message: t('settings.rebuildConfirm') })) return
    setRebuilding(true)
    try {
      const missing = (await api.library.detectMissing?.()) ?? []
      setRebuilding(false)
      if (missing.length === 0) {
        await runRebuild([])
      } else {
        setPurgeSel(new Set())
        setMissingDocs(missing)
      }
    } catch (e) {
      toast.error(t('settings.detectFailed', String(e)))
      setRebuilding(false)
    }
  }, [api, t, runRebuild])

  return (
    <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>{t('settings.title')}</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, marginBottom: 28 }}>
        <span>{t('settings.language')}</span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={{ fontSize: 13, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
        </select>
      </div>

      <ScreenshotHotkeySetting />
      <DockSetting />

      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.appTheme')}</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {APP_THEMES.map(th => {
          const active = th.key === appTheme
          const previewColors = th.key === 'minimal'
            ? { bg: '#FAFAF9', titleBar: '#F5F5F4', titleBorder: '#E7E5E4', sidebar: '#FAFAF9', sidebarBorder: '#E7E5E4', heading: '#18181B', sub: '#A1A1AA', line: '#E7E5E4' }
            : th.key === 'notebook'
            ? { bg: '#F3EEE5', titleBar: '#F3EEE5', titleBorder: '#E0D8C8', sidebar: '#F3EEE5', sidebarBorder: '#E0D8C8', heading: '#2C2C2C', sub: '#E8825D', line: '#E0D8C8' }
            : { bg: '#F7F3EA', titleBar: 'linear-gradient(180deg, #EFE8D7, #E8E0CC)', titleBorder: '#E5DCC4', sidebar: '#F7F3EA', sidebarBorder: 'rgba(28,26,23,0.08)', heading: '#1C1A17', sub: '#9A938A', line: '#E5DCC4' }
          return (
            <div
              key={th.key}
              onClick={() => setAppTheme(th.key)}
              style={{
                width: 120, cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{
                width: 100, height: 64, borderRadius: 8, overflow: 'hidden',
                border: active ? '2px solid var(--accent)' : '1px solid var(--border-solid)',
                boxShadow: active ? '0 0 0 2px var(--accent-soft)' : 'none',
                transition: 'all 0.15s ease',
                background: previewColors.bg,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  height: 10,
                  background: previewColors.titleBar,
                  borderBottom: `1px solid ${previewColors.titleBorder}`,
                }} />
                <div style={{ flex: 1, display: 'flex' }}>
                  <div style={{
                    width: 20,
                    background: previewColors.sidebar,
                    borderRight: `1px solid ${previewColors.sidebarBorder}`,
                  }} />
                  <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ height: 4, width: '60%', borderRadius: 1, background: previewColors.heading }} />
                    <div style={{ height: 3, width: '40%', borderRadius: 1, background: previewColors.sub }} />
                    <div style={{ height: 3, width: '80%', borderRadius: 1, background: previewColors.line }} />
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {t(th.labelKey)}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.noteTheme')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {NOTE_THEME_KEYS.map((key) => {
          const theme = NOTE_THEMES[key]
          const active = key === noteTheme
          return (
            <div
              key={key}
              onClick={() => handleThemeChange(key)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: active ? '2px solid var(--note-h1-color, #2b579a)' : '1px solid var(--border, #e0e0e0)',
                cursor: 'pointer',
                background: active ? 'var(--surface-raised, #f8f9fa)' : 'var(--surface, #fff)',
                transition: 'all 150ms',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h1 }} />
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h2 }} />
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h3 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: 'var(--text)' }}>
                {theme.name}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 28, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.maintenance')}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6, maxWidth: 560 }}>
        {t('settings.rebuildDesc')}
      </div>
      <button
        onClick={startRebuild}
        disabled={rebuilding}
        style={{
          fontSize: 13, padding: '6px 14px', borderRadius: 6, cursor: rebuilding ? 'default' : 'pointer',
          border: '1px solid #c0392b', color: '#c0392b', background: 'transparent', opacity: rebuilding ? 0.5 : 1,
        }}
      >
        {rebuilding ? t('settings.rebuilding') : t('settings.rebuildLibrary')}
      </button>

      {missingDocs && (
        <div onClick={() => setMissingDocs(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: 10, padding: 20, width: 520, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{t('settings.missingTitle')}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
              {t('settings.missingDesc')}
            </p>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14 }}>
              {missingDocs.map(d => (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={purgeSel.has(d.id)} onChange={() => {
                    setPurgeSel(prev => { const n = new Set(prev); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n })
                  }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.path}</div>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setPurgeSel(prev => prev.size === missingDocs.length ? new Set() : new Set(missingDocs.map(d => d.id)))}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                {purgeSel.size === missingDocs.length ? t('settings.selectNone') : t('settings.selectAll')}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMissingDocs(null)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>{t('common.cancel')}</button>
                <button onClick={() => runRebuild(Array.from(purgeSel))} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer' }}>
                  {t('settings.rebuildPurge', purgeSel.size)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rebuilding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, color: '#fff', fontSize: 14 }}>
          {t('settings.rebuildingWait')}
        </div>
      )}
    </div>
  )
}
