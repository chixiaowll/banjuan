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

  const [hostStatus, setHostStatus] = useState<{ running: boolean; url: string | null; pin: string | null }>({ running: false, url: null, pin: null })
  const [peerUrl, setPeerUrl] = useState('')
  const [peerPin, setPeerPin] = useState('')
  const [lanBusy, setLanBusy] = useState(false)
  const [lanMsg, setLanMsg] = useState('')

  const toggleHost = async () => {
    setLanBusy(true)
    try {
      if (hostStatus.running) {
        await api.lan.stopHost()
        setHostStatus({ running: false, url: null, pin: null })
        setLanMsg('')
      } else {
        const s = await api.lan.startHost()
        setHostStatus({ running: s.running, url: s.url, pin: s.pin })
        setLanMsg('')
      }
    } catch (e: any) {
      setLanMsg(`开启共享失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }

  const connectPeer = async () => {
    if (!peerUrl || !/^\d{6}$/.test(peerPin)) { setLanMsg('请输入对方地址和 6 位 PIN'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    try {
      const r = await api.lan.connectAndSync(peerUrl, peerPin, (p) => setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`))
      setLanMsg(`完成:↓${r.downloaded} ↑${r.uploaded} 删除 ${r.deletedLocal + r.deletedRemote}${r.errors.length ? `,错误 ${r.errors.length}` : ''}`)
    } catch (e: any) {
      setLanMsg(`失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }

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

  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: 'var(--ink-mute, var(--text-secondary, #6e6e73))' }
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--paper-edge, var(--border-solid, #e5e5e7))',
    background: 'var(--surface-raised, #fff)', fontSize: '14px', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none',
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      padding: '48px 24px 80px',
    }}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: 'var(--ink, #2A2722)' }}>{t('sync.title')}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-mute, #8A8377)', margin: 0 }}>WebDAV</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>{t('sync.url')}</label>
            <input style={inputStyle} type="url" placeholder="https://example.com/dav" value={config.url}
              onChange={(e) => setConfig(c => ({ ...c, url: e.target.value }))} disabled={syncing} />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>{t('sync.username')}</label>
              <input style={inputStyle} type="text" value={config.username}
                onChange={(e) => setConfig(c => ({ ...c, username: e.target.value }))} disabled={syncing} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>{t('sync.password')}</label>
              <input style={inputStyle} type="password" value={config.password}
                onChange={(e) => setConfig(c => ({ ...c, password: e.target.value }))} disabled={syncing} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>{t('sync.remotePath')}</label>
            <input style={inputStyle} type="text" placeholder="/banjuan" value={config.remotePath}
              onChange={(e) => setConfig(c => ({ ...c, remotePath: e.target.value }))} disabled={syncing} />
          </div>
        </div>

        <button onClick={handleTestConnection} disabled={testing || syncing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '13px', color: 'var(--ink-soft, var(--text-muted))',
            border: '1px solid var(--paper-edge, var(--border))', borderRadius: '8px', background: 'var(--surface-raised, #fff)',
            cursor: testing || syncing ? 'not-allowed' : 'pointer', opacity: testing || syncing ? 0.5 : 1,
            alignSelf: 'flex-start', fontWeight: 500,
          }}>
          <Wifi size={14} />{testing ? t('sync.testing') : t('sync.testConnection')}
        </button>

        {progress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--ink-mute, var(--text-muted))' }}>
              <span>{getPhaseLabel(progress.phase)}{progress.total > 0 ? ` ${progress.current}/${progress.total}` : ''}</span>
              {getEstimatedRemaining() && <span>{getEstimatedRemaining()} remaining</span>}
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--paper-edge, var(--border, #e0e0e0))', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                background: '#4A90E2',
                width: progress.phase === 'scanning' ? '0%' : `${pct}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-mute, var(--text-muted))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {progress.currentFile}
            </div>
          </div>
        )}

        {status && !progress && (
          <div style={{
            fontSize: '13px', color: status.isError ? '#ff3b30' : '#34c759',
            padding: '10px 14px', borderRadius: '8px',
            background: status.isError ? 'rgba(255,59,48,0.06)' : 'rgba(52,199,89,0.06)',
          }}>
            {status.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving || syncing}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
              background: '#4A90E2', color: '#fff', border: 'none',
              cursor: saving || syncing ? 'not-allowed' : 'pointer',
              opacity: saving || syncing ? 0.6 : 1,
              boxShadow: '0 2px 6px rgba(74,144,226,.3)',
            }}>
            <Save size={14} />{saving ? t('sync.saving') : t('sync.saveConfig')}
          </button>
          <button onClick={handleSync} disabled={syncing}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
              background: 'var(--surface-raised, #fff)', color: 'var(--ink-soft, var(--text))',
              border: '1px solid var(--paper-edge, var(--border))',
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.6 : 1,
            }}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            {syncing ? `${pct}%` : t('sync.syncNow')}
          </button>
        </div>

        <div style={{ paddingTop: 20, borderTop: '1px solid var(--paper-edge, var(--border-solid, #e5e5e7))' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px', color: 'var(--ink, #2A2722)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wifi size={15} />局域网直连<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-mute, #8A8377)' }}>（同一 Wi-Fi）</span>
          </h3>

          {/* Host section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            <div style={labelStyle}>开启共享（本机作为 host）</div>
            <button
              onClick={toggleHost}
              disabled={lanBusy}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                background: hostStatus.running ? 'rgba(255,59,48,0.08)' : '#4A90E2',
                color: hostStatus.running ? '#ff3b30' : '#fff',
                border: hostStatus.running ? '1px solid rgba(255,59,48,0.25)' : 'none',
                cursor: lanBusy ? 'not-allowed' : 'pointer',
                opacity: lanBusy ? 0.6 : 1,
                alignSelf: 'flex-start',
                boxShadow: hostStatus.running ? 'none' : '0 2px 6px rgba(74,144,226,.3)',
              }}
            >
              {hostStatus.running ? '停止共享' : '开启共享'}
            </button>
            {hostStatus.running && hostStatus.url && (
              <div style={{
                padding: '12px 14px', borderRadius: 8, fontSize: 13,
                background: 'rgba(52,199,89,0.06)', border: '1px solid rgba(52,199,89,0.2)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ color: 'var(--ink-mute, #8A8377)' }}>在另一台设备填入地址：</div>
                <code style={{
                  fontSize: 13, padding: '4px 8px', borderRadius: 6,
                  background: 'var(--surface-raised, #fff)', border: '1px solid var(--paper-edge, #e5e5e7)',
                  userSelect: 'all', wordBreak: 'break-all',
                }}>
                  {hostStatus.url}
                </code>
                <div style={{ color: 'var(--ink-mute, #8A8377)', marginTop: 2 }}>配对 PIN：</div>
                <strong style={{ fontSize: 24, letterSpacing: 6, color: 'var(--ink, #2A2722)', fontFamily: 'monospace' }}>
                  {hostStatus.pin}
                </strong>
              </div>
            )}
          </div>

          {/* Client section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={labelStyle}>连接附近设备（本机作为 client）</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                type="text"
                placeholder="http://192.168.x.x:端口"
                value={peerUrl}
                onChange={(e) => setPeerUrl(e.target.value)}
                disabled={lanBusy}
              />
              <input
                style={{ ...inputStyle, width: 100, flex: 'none' }}
                type="text"
                inputMode="numeric"
                placeholder="6 位 PIN"
                value={peerPin}
                onChange={(e) => setPeerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={lanBusy}
              />
            </div>
            <button
              onClick={connectPeer}
              disabled={lanBusy}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                background: 'var(--surface-raised, #fff)', color: 'var(--ink-soft, var(--text))',
                border: '1px solid var(--paper-edge, var(--border))',
                cursor: lanBusy ? 'not-allowed' : 'pointer',
                opacity: lanBusy ? 0.6 : 1,
                alignSelf: 'flex-start',
              }}
            >
              <RefreshCw size={14} className={lanBusy ? 'spin' : ''} />
              连接并同步
            </button>
            {lanMsg && (
              <div style={{
                fontSize: 13, padding: '10px 14px', borderRadius: 8,
                color: lanMsg.startsWith('失败') ? '#ff3b30' : 'var(--ink-mute, #8A8377)',
                background: lanMsg.startsWith('失败') ? 'rgba(255,59,48,0.06)' : 'rgba(0,0,0,0.03)',
              }}>
                {lanMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
