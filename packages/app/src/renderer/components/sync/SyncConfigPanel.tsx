import React, { useEffect, useState } from 'react'
import { Save, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n/index.js'

interface SyncConfig {
  url: string
  username: string
  password: string
  remotePath: string
}

interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  errors: string[]
}

interface Props {
  onClose: () => void
}

export default function SyncConfigPanel({ onClose }: Props) {
  const t = useT()
  const [config, setConfig] = useState<SyncConfig>({
    url: '',
    username: '',
    password: '',
    remotePath: '/banjuan',
  })
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const existing = await (window as any).electronAPI.sync.getConfig()
        if (existing) {
          setConfig({
            url: existing.url ?? '',
            username: existing.username ?? '',
            password: existing.password ?? '',
            remotePath: existing.remotePath ?? '/banjuan',
          })
        }
      } catch {}
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await (window as any).electronAPI.sync.saveConfig(config)
      setStatus({ message: t('sync.configSaved'), isError: false })
    } catch (err: any) {
      setStatus({ message: t('sync.saveFailed', err?.message ?? String(err)), isError: true })
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setStatus(null)
    try {
      const result: SyncResult = await (window as any).electronAPI.sync.run()
      const { uploaded, downloaded, deletedLocal, deletedRemote, errors } = result
      if (errors && errors.length > 0) {
        setStatus({ message: t('sync.syncWithErrors', errors.join('; ')), isError: true })
      } else {
        setStatus({
          message: t('sync.syncSuccess', uploaded, downloaded, deletedLocal, deletedRemote),
          isError: false,
        })
      }
    } catch (err: any) {
      setStatus({ message: t('sync.syncFailed', err?.message ?? String(err)), isError: true })
    } finally {
      setSyncing(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-muted)',
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', margin: 0 }}>{t('sync.title')}</h2>
          <button onClick={onClose} style={{ fontSize: '16px', lineHeight: 1, padding: '2px 8px' }}>×</button>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.url')}</label>
          <input
            style={inputStyle}
            type="url"
            placeholder="https://example.com/dav"
            value={config.url}
            onChange={(e) => setConfig(c => ({ ...c, url: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.username')}</label>
          <input
            style={inputStyle}
            type="text"
            value={config.username}
            onChange={(e) => setConfig(c => ({ ...c, username: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.password')}</label>
          <input
            style={inputStyle}
            type="password"
            value={config.password}
            onChange={(e) => setConfig(c => ({ ...c, password: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.remotePath')}</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="/banjuan"
            value={config.remotePath}
            onChange={(e) => setConfig(c => ({ ...c, remotePath: e.target.value }))}
          />
        </div>

        {status && (
          <div style={{
            fontSize: '13px',
            color: status.isError ? '#c44040' : '#4a8c4a',
            padding: '8px 10px',
            borderRadius: '4px',
            border: `1px solid ${status.isError ? '#c44040' : '#4a8c4a'}`,
          }}>
            {status.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="primary"
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Save size={14} />{saving ? t('sync.saving') : t('sync.saveConfig')}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <RefreshCw size={14} />{syncing ? t('sync.syncing') : t('sync.syncNow')}
          </button>
        </div>
      </div>
    </div>
  )
}
