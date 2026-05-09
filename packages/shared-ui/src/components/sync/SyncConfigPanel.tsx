import React, { useEffect, useState, useRef } from 'react'
import { Save, RefreshCw } from 'lucide-react'
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

  const handleSync = async () => {
    setSyncing(true)
    setStatus(null)
    startTimeRef.current = Date.now()
    setProgress({ phase: 'scanning', current: 0, total: 0, currentFile: '', startTime: Date.now() })
    try {
      await api.sync.run((p) => {
        setProgress({
          phase: p.phase,
          current: p.current,
          total: p.total,
          currentFile: p.currentFile,
          startTime: startTimeRef.current,
        })
      })
      setProgress(null)
      setStatus({ message: t('sync.syncSuccess', 0, 0, 0, 0), isError: false })
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

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' }
  const labelStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-muted)' }
  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'var(--surface)', fontSize: '14px', width: '100%', boxSizing: 'border-box',
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget && !syncing) onClose() }}>
      <div style={{
        background: 'var(--surface, #fff)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '24px', width: '420px',
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

        {progress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
              <span>{getPhaseLabel(progress.phase)}{progress.total > 0 ? ` ${progress.current}/${progress.total}` : ''}</span>
              {getEstimatedRemaining() && <span>{getEstimatedRemaining()} remaining</span>}
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border, #e0e0e0)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                background: '#228be6',
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
            fontSize: '13px', color: status.isError ? '#c44040' : '#4a8c4a',
            padding: '8px 10px', borderRadius: '6px',
            background: status.isError ? 'rgba(196,64,64,0.08)' : 'rgba(74,140,74,0.08)',
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
