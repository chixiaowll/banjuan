import React, { useEffect, useState, useRef } from 'react'
import { Save, RefreshCw, Wifi } from 'lucide-react'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'

interface SyncConfig {
  url: string
  username: string
  password: string
  remotePath: string
}

interface SyncProgressState {
  phase: string
  current: number
  total: number
  currentFile: string
  startTime: number
}

interface Props {
  onClose: () => void
}

export default function SyncConfigPanel({ onClose }: Props) {
  const api = useBanjuanAPI()
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
  const [testing, setTesting] = useState(false)
  const [progress, setProgress] = useState<SyncProgressState | null>(null)
  const startTimeRef = useRef(0)

  useEffect(() => {
    const load = async () => {
      try {
        const existing = await api.sync.getConfig()
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
      await api.sync.saveConfig(config as any)
      setStatus({ message: t('sync.configSaved'), isError: false })
    } catch (err: any) {
      setStatus({ message: t('sync.saveFailed', err?.message ?? String(err)), isError: true })
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`
    const m = Math.floor(seconds / 60)
    const s = Math.ceil(seconds % 60)
    return `${m}m ${s}s`
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const result = await api.sync.testConnection(config as any)
      setStatus({ message: result.message, isError: !result.ok })
    } catch (err: any) {
      setStatus({ message: err?.message ?? String(err), isError: true })
    } finally {
      setTesting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setStatus(null)
    startTimeRef.current = Date.now()
    setProgress({ phase: 'scanning', current: 0, total: 0, currentFile: '', startTime: Date.now() })
    try {
      const result = await api.sync.run((p) => {
        setProgress({
          phase: p.phase,
          current: p.current,
          total: p.total,
          currentFile: p.currentFile,
          startTime: startTimeRef.current,
        })
      })
      setProgress(null)
      const r = result ?? { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0 }
      setStatus({ message: t('sync.syncSuccess', r.uploaded, r.downloaded, r.deletedLocal, r.deletedRemote), isError: false })
    } catch (err: any) {
      setProgress(null)
      setStatus({ message: t('sync.syncFailed', err?.message ?? String(err)), isError: true })
    } finally {
      setSyncing(false)
    }
  }

  const getEstimatedRemaining = (): string | null => {
    if (!progress || progress.total === 0 || progress.current === 0) return null
    const elapsed = (Date.now() - progress.startTime) / 1000
    const rate = progress.current / elapsed
    const remaining = (progress.total - progress.current) / rate
    return formatTime(remaining)
  }

  const getPhaseLabel = (phase: string): string => {
    switch (phase) {
      case 'scanning': return 'Scanning files...'
      case 'syncing': return 'Syncing'
      case 'finalizing': return 'Rebuilding index...'
      default: return phase
    }
  }

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' }
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6e6e73)' }
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-solid, #e5e5e7)',
    background: 'var(--surface-raised, #fff)', fontSize: '14px', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none',
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget && !syncing) onClose() }}>
      <div style={{
        background: 'var(--surface-raised, #fff)', border: '1px solid var(--border-solid, #e5e5e7)',
        borderRadius: 'var(--radius-lg, 14px)', padding: '24px', width: '420px',
        boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.08))',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', margin: 0 }}>{t('sync.title')}</h2>
          <button onClick={onClose} disabled={syncing} style={{ fontSize: '16px', lineHeight: 1, padding: '2px 8px', opacity: syncing ? 0.3 : 1 }}>×</button>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.url')}</label>
          <input style={inputStyle} type="url" placeholder="https://example.com/dav" value={config.url}
            onChange={(e) => setConfig(c => ({ ...c, url: e.target.value }))} disabled={syncing} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.username')}</label>
          <input style={inputStyle} type="text" value={config.username}
            onChange={(e) => setConfig(c => ({ ...c, username: e.target.value }))} disabled={syncing} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.password')}</label>
          <input style={inputStyle} type="password" value={config.password}
            onChange={(e) => setConfig(c => ({ ...c, password: e.target.value }))} disabled={syncing} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>{t('sync.remotePath')}</label>
          <input style={inputStyle} type="text" placeholder="/banjuan" value={config.remotePath}
            onChange={(e) => setConfig(c => ({ ...c, remotePath: e.target.value }))} disabled={syncing} />
        </div>

        <button onClick={handleTestConnection} disabled={testing || syncing}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '6px 12px', fontSize: '13px', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent',
            cursor: testing || syncing ? 'not-allowed' : 'pointer', opacity: testing || syncing ? 0.5 : 1,
            alignSelf: 'flex-start',
          }}>
          <Wifi size={14} />{testing ? t('sync.testing') : t('sync.testConnection')}
        </button>

        {progress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
              <span>{getPhaseLabel(progress.phase)}{progress.total > 0 ? ` ${progress.current}/${progress.total}` : ''}</span>
              {getEstimatedRemaining() && <span>{getEstimatedRemaining()} remaining</span>}
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border, #e0e0e0)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                background: 'var(--accent, #5856d6)',
                width: progress.phase === 'scanning' ? '0%' : `${pct}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {progress.currentFile}
            </div>
          </div>
        )}

        {status && !progress && (
          <div style={{
            fontSize: '13px', color: status.isError ? '#ff3b30' : '#34c759',
            padding: '8px 12px', borderRadius: 'var(--radius-sm, 6px)',
            background: status.isError ? 'rgba(255,59,48,0.06)' : 'rgba(52,199,89,0.06)',
          }}>
            {status.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="primary" onClick={handleSave} disabled={saving || syncing}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Save size={14} />{saving ? t('sync.saving') : t('sync.saveConfig')}
          </button>
          <button onClick={handleSync} disabled={syncing}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            {syncing ? `${pct}%` : t('sync.syncNow')}
          </button>
        </div>
      </div>
    </div>
  )
}
