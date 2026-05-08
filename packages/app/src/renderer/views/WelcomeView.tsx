import React, { useState } from 'react'
import { useI18n } from '../i18n/index.js'
import type { Locale } from '../i18n/index.js'

interface Props {
  onOpen: (path: string, name: string) => void
}

export default function WelcomeView({ onOpen }: Props) {
  const { t, locale, setLocale } = useI18n()
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [pendingDir, setPendingDir] = useState<string | null>(null)
  const [libraryName, setLibraryName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelectDir = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return

    const isLibrary = await window.electronAPI.library.check(dir)
    if (isLibrary) {
      setLoading(true)
      try {
        const result = await window.electronAPI.library.open(dir)
        onOpen(result.rootPath, result.name)
      } catch (e: any) {
        alert(e.message)
      } finally {
        setLoading(false)
      }
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
      const result = await window.electronAPI.library.init(pendingDir, libraryName.trim())
      onOpen(result.rootPath, result.name)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
      setShowNameDialog(false)
    }
  }

  const handleCancel = () => {
    setShowNameDialog(false)
    setPendingDir(null)
    setLibraryName('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
    }}>
      <div style={{ position: 'absolute', top: 12, right: 16 }}>
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
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{t('app.slogan')}</p>

      {!showNameDialog ? (
        <button className="primary" onClick={handleSelectDir} disabled={loading}>
          {loading ? t('welcome.opening') : t('welcome.selectDir')}
        </button>
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
