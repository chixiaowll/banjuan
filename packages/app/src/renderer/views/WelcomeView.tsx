import React, { useState, useEffect } from 'react'
import { useBanjuanAPI, useI18n, PoetryCard } from '@banjuan/shared-ui'
import type { Locale } from '@banjuan/shared-ui'

interface RecentLibrary {
  path: string
  name: string
  lastOpened: string
}

interface Props {
  onOpen: (path: string, name: string) => void
}

export default function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const { t, locale, setLocale } = useI18n()
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [pendingDir, setPendingDir] = useState<string | null>(null)
  const [libraryName, setLibraryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [recentLibraries, setRecentLibraries] = useState<RecentLibrary[]>([])

  useEffect(() => {
    api.library.getHistory?.().then((h: RecentLibrary[]) => setRecentLibraries(h ?? []))
  }, [])

  const openLibrary = async (dir: string) => {
    setLoading(true)
    try {
      const result = await api.library.open(dir)
      const name = (result as any).name || dir.split('/').pop() || ''
      onOpen((result as any).rootPath, name)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDir = async () => {
    const dir = await api.dialog.openDirectory()
    if (!dir) return

    const isLibrary = await api.library.check(dir)
    if (isLibrary) {
      await openLibrary(dir)
    } else {
      setPendingDir(dir)
      setLibraryName(dir.split('/').pop() || '')
      setShowNameDialog(true)
    }
  }

  const handleCreateLibrary = async () => {
    if (!pendingDir || !libraryName.trim()) return
    setLoading(true)
    try {
      const result = await api.library.init(pendingDir, libraryName.trim())
      const name = (result as any).name || libraryName.trim()
      onOpen((result as any).rootPath, name)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
      setShowNameDialog(false)
    }
  }

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    await api.library.removeHistory?.(path)
    const h = await api.library.getHistory?.() ?? []
    setRecentLibraries(h)
  }

  const handleCancel = () => {
    setShowNameDialog(false)
    setPendingDir(null)
    setLibraryName('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 16,
      overflowY: 'auto', padding: '40px 0',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 40,
        WebkitAppRegion: 'drag' as any,
      }} />
      <div style={{ position: 'absolute', top: 12, right: 16, WebkitAppRegion: 'no-drag' as any }}>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>{t('app.name')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{t('app.slogan')}</p>
      <div style={{ width: 380, marginBottom: 24 }}>
        <PoetryCard locale={locale} />
      </div>

      {!showNameDialog ? (
        <>
          {recentLibraries.length > 0 && (
            <div style={{ width: 380, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('welcome.recentLibraries') ?? 'Recent Libraries'}
              </div>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
                background: 'var(--surface)',
              }}>
                {recentLibraries.map((lib, i) => (
                  <div key={lib.path}
                    onClick={() => !loading && openLibrary(lib.path)}
                    style={{
                      padding: '10px 14px', cursor: loading ? 'default' : 'pointer',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      display: 'flex', alignItems: 'center', gap: 10,
                      opacity: loading ? 0.5 : 1,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lib.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {lib.path}
                      </div>
                    </div>
                    <button onClick={(e) => handleRemoveRecent(e, lib.path)}
                      style={{ fontSize: 14, padding: '2px 6px', color: 'var(--text-muted)', border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                      title="Remove">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="primary" onClick={handleSelectDir} disabled={loading}>
            {loading ? t('welcome.opening') : t('welcome.selectDir')}
          </button>
        </>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, padding: 24, border: '1px solid var(--border)',
          borderRadius: 8, background: 'var(--surface)', minWidth: 320,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('welcome.createLibrary')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            {t('welcome.createLibraryDesc')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', textAlign: 'center' }}>
            {pendingDir}
          </div>
          <input
            type="text"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            placeholder={t('welcome.libraryName')}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLibrary() }}
            style={{
              width: '100%', fontSize: 14, padding: '8px 12px',
              border: '1px solid var(--border)', borderRadius: 4,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCancel} disabled={loading}>{t('welcome.cancel')}</button>
            <button className="primary" onClick={handleCreateLibrary} disabled={loading || !libraryName.trim()}>
              {loading ? t('welcome.creating') : t('welcome.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
