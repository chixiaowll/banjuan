import React, { useState, useEffect } from 'react'
import { useBanjuanAPI, useI18n, PoetryCard } from '@banjuan/shared-ui'
import type { Locale } from '@banjuan/shared-ui'
import { FolderOpen, Plus, X, ChevronRight } from 'lucide-react'

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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    api.library.getHistory?.().then((h: RecentLibrary[]) => setRecentLibraries(h ?? []))
  }, [])

  const warnIfTruncated = (result: any) => {
    if (!result?.truncated) return
    const n = result.limit
    alert(locale === 'zh'
      ? `该目录文件数超过上限（${n}），未导入任何文件。请选择文件更少的目录或更小的子目录重新打开。`
      : `This folder exceeds the ${n}-file limit, so nothing was imported. Please pick a folder with fewer files (or a smaller subfolder).`)
  }

  const openLibrary = async (dir: string) => {
    setLoading(true)
    try {
      const result = await api.library.open(dir)
      const name = (result as any).name || dir.split('/').pop() || ''
      warnIfTruncated(result)
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
      // Pre-check size before creating anything — a too-large folder must not
      // leave behind a .banjuan / database.
      const size = await api.library.checkSize?.(dir)
      if (size?.exceeds) {
        alert(locale === 'zh'
          ? `该目录文件数超过上限（${size.limit}），不能作为资料库。请选择文件更少的目录，或更小的子目录。`
          : `This folder exceeds the ${size.limit}-file limit and can't be used as a library. Please pick a folder with fewer files (or a smaller subfolder).`)
        return
      }
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
      warnIfTruncated(result)
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

  const formatLastOpened = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffDays = Math.floor(diffMs / 86400000)
      if (diffDays === 0) return locale === 'zh' ? '今天' : 'Today'
      if (diffDays === 1) return locale === 'zh' ? '昨天' : 'Yesterday'
      if (diffDays < 7) return locale === 'zh' ? `${diffDays} 天前` : `${diffDays}d ago`
      return d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      overflowY: 'auto', padding: '60px 24px',
      background: 'var(--bg)',
    }}>
      {/* Drag region */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 40,
        WebkitAppRegion: 'drag' as any,
      }} />

      {/* Language switcher */}
      <div style={{ position: 'absolute', top: 12, right: 16, WebkitAppRegion: 'no-drag' as any }}>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={{
            fontSize: 12, padding: '4px 8px',
            border: '1px solid var(--border-solid)', borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-raised)', color: 'var(--text-muted)',
          }}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>

      {!showNameDialog ? (
        <div style={{ width: 720, maxWidth: '90%' }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{
              fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em',
              color: 'var(--text)', marginBottom: 6, lineHeight: 1.2,
            }}>
              {t('app.name')}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 400 }}>
              {t('app.slogan')}
            </p>
          </div>

          {/* Poetry */}
          <div style={{ marginBottom: 40 }}>
            <PoetryCard locale={locale} />
          </div>

          {/* Recent libraries */}
          {recentLibraries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {t('welcome.recentLibraries') ?? 'Recent Libraries'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentLibraries.map((lib, i) => (
                  <div key={lib.path}
                    onClick={() => !loading && openLibrary(lib.path)}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{
                      padding: '10px 12px', cursor: loading ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                      opacity: loading ? 0.5 : 1,
                      background: hoveredIdx === i ? 'var(--hover)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'background 0.15s ease',
                    }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'var(--accent-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 500, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: 'var(--text)', lineHeight: 1.3,
                      }}>
                        {lib.name}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
                        lineHeight: 1.3,
                      }}>
                        {lib.path}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {lib.lastOpened && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatLastOpened(lib.lastOpened)}
                        </span>
                      )}
                      <button onClick={(e) => handleRemoveRecent(e, lib.path)}
                        style={{
                          width: 20, height: 20, padding: 0,
                          color: 'var(--text-muted)', border: 'none', background: 'transparent',
                          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: hoveredIdx === i ? 0.6 : 0,
                          transition: 'opacity 0.15s ease',
                        }}
                        title="Remove">
                        <X size={13} />
                      </button>
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open button */}
          <button className="primary" onClick={handleSelectDir} disabled={loading}
            style={{
              width: '100%', padding: '12px 20px', fontSize: 14, fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Plus size={16} />
            {loading ? t('welcome.opening') : t('welcome.selectDir')}
          </button>
        </div>
      ) : (
        /* Create library dialog */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          gap: 16, padding: 28, width: 420,
          border: '1px solid var(--border-solid)',
          borderRadius: 'var(--radius-lg)', background: 'var(--surface-raised)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              {t('welcome.createLibrary')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('welcome.createLibraryDesc')}
            </div>
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all',
            textAlign: 'center', padding: '8px 12px',
            background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
          }}>
            {pendingDir}
          </div>
          <input
            type="text"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            placeholder={t('welcome.libraryName')}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLibrary() }}
            style={{ fontSize: 14, padding: '10px 14px' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleCancel} disabled={loading}
              style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}>
              {t('welcome.cancel')}
            </button>
            <button className="primary" onClick={handleCreateLibrary}
              disabled={loading || !libraryName.trim()}
              style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}>
              {loading ? t('welcome.creating') : t('welcome.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
