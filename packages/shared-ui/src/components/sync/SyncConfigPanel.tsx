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
  // Identifies the current library so the LAN peer address/PIN are remembered
  // per-library (each 书房 connects to its own peer), not globally.
  libraryKey?: string
}

export default function SyncConfigPanel({ onClose, libraryKey }: Props) {
  const api = useBanjuanAPI()
  const canHost = api.lan.canHost !== false   // undefined (older desktop) treated as can-host; mobile sets false
  const t = useT()
  const lanUrlKey = `banjuan.lan.peerUrl:${libraryKey ?? ''}`
  const lanPinKey = `banjuan.lan.peerPin:${libraryKey ?? ''}`
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
  // Persist the peer address/PIN so they survive navigating away from this panel
  // (and app restarts) — otherwise the user must retype them every time.
  const [peerUrl, setPeerUrlState] = useState(() => {
    try { return localStorage.getItem(lanUrlKey) ?? '' } catch { return '' }
  })
  const [peerPin, setPeerPinState] = useState(() => {
    try { return localStorage.getItem(lanPinKey) ?? '' } catch { return '' }
  })
  const setPeerUrl = (v: string) => {
    setPeerUrlState(v)
    try { localStorage.setItem(lanUrlKey, v) } catch { /* ignore */ }
  }
  const setPeerPin = (v: string) => {
    setPeerPinState(v)
    try { localStorage.setItem(lanPinKey, v) } catch { /* ignore */ }
  }
  const [lanBusy, setLanBusy] = useState(false)
  const [lanMsg, setLanMsg] = useState('')
  const [pairedDevices, setPairedDevices] = useState<Array<{ peerDeviceId: string; peerDeviceName: string; peerLibraryId: string; linkedAt: string }>>([])

  const loadPaired = async () => {
    try { setPairedDevices(await api.lan.listPairedDevices()) } catch { setPairedDevices([]) }
  }

  const unpair = async (peerDeviceId: string) => {
    await api.lan.unpairDevice(peerDeviceId)
    await loadPaired()
  }

  const [nearby, setNearby] = useState<Array<{ deviceId: string; deviceName: string; libraryName: string; libraryId: string; url: string }>>([])
  const [scanning, setScanning] = useState(false)

  const pairedIds = new Set(pairedDevices.map(d => d.peerDeviceId))

  const scanNearby = async () => {
    setScanning(true)
    setLanMsg('')
    try { setNearby(await api.lan.scanNearby()) } finally { setScanning(false) }
  }

  const connectNearby = async (url: string) => {
    if (!/^\d{6}$/.test(peerPin)) { setLanMsg('请输入对方显示的 6 位 PIN'); return }
    setLanBusy(true)
    setLanMsg('连接中…')
    try {
      const r = await api.lan.pairDevice(url, peerPin)
      setLanMsg(`已连接「${r.libraryName || r.deviceName}」`)
      await loadPaired()
    } catch (e: any) {
      setLanMsg(`连接失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }

  const syncWith = async (url: string) => {
    setLanBusy(true)
    setLanMsg('同步中…')
    const onProgress = (p: { phase: string; current: number; total: number; currentFile: string }) =>
      setLanMsg(`${p.phase} ${p.current}/${p.total} ${p.currentFile}`)
    try {
      let r = await api.lan.syncDevice(url, onProgress)
      if ('needsPair' in r) { setLanMsg('尚未连接该设备,请先点"连接"'); return }
      if ('needsConfirm' in r) {
        const ok = confirm(`对方是不同的书房「${r.peerName}」,当前是「${r.localName}」。继续会把两个书房合并,通常你不想这样。确定继续吗?`)
        if (!ok) { setLanMsg('已取消'); return }
        setLanMsg('合并中…')
        const r2 = await api.lan.syncDevice(url, onProgress, true)
        if ('needsConfirm' in r2 || 'needsPair' in r2) { setLanMsg('已取消'); return }
        showSyncResult(r2); await loadPaired(); return
      }
      showSyncResult(r); await loadPaired()
    } catch (e: any) {
      setLanMsg(`同步失败:${e?.message ?? String(e)}`)
    } finally {
      setLanBusy(false)
    }
  }

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

  const showSyncResult = (r: { downloaded: number; uploaded: number; deletedLocal: number; deletedRemote: number; errors: string[] }) => {
    setLanMsg(`完成:↓${r.downloaded} ↑${r.uploaded} 删除 ${r.deletedLocal + r.deletedRemote}${r.errors.length ? `,错误 ${r.errors.length}` : ''}`)
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
      try {
        const s = await api.lan.getHostStatus()
        if (s.running) setHostStatus({ running: true, url: s.url, pin: s.pin })
      } catch { /* ignore */ }
      await loadPaired()
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

  const [tab, setTab] = useState<'webdav' | 'lan'>('lan')

  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: 'var(--ink-mute, var(--text-secondary, #6e6e73))' }
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--paper-edge, var(--border-solid, #e5e5e7))',
    background: 'var(--surface-raised, #fff)', fontSize: '14px', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none',
  }
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? 'var(--surface-raised, #fff)' : 'transparent',
    color: active ? 'var(--ink, #2A2722)' : 'var(--ink-mute, #8A8377)',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.12s',
  })

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '40px 32px 80px' }}>
      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: 'var(--ink, #2A2722)', outline: 'none' }}>{t('sync.title')}</h2>
          {/* Tab switcher */}
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--paper-edge, #ebe7de)', gap: 2 }}>
            <button style={tabBtnStyle(tab === 'lan')} onClick={() => setTab('lan')}>
              <Wifi size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />局域网直连
            </button>
            <button style={tabBtnStyle(tab === 'webdav')} onClick={() => setTab('webdav')}>
              WebDAV 云同步
            </button>
          </div>
        </div>

        {/* ── WebDAV tab ── */}
        {tab === 'webdav' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          {progress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-mute)' }}>
                <span>{getPhaseLabel(progress.phase)}{progress.total > 0 ? ` ${progress.current}/${progress.total}` : ''}</span>
                {getEstimatedRemaining() && <span>{getEstimatedRemaining()} remaining</span>}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--paper-edge, #e0e0e0)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#4A90E2', width: progress.phase === 'scanning' ? '0%' : `${pct}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{progress.currentFile}</div>
            </div>
          )}

          {status && !progress && (
            <div style={{ fontSize: 13, color: status.isError ? '#ff3b30' : '#34c759', padding: '10px 14px', borderRadius: 8, marginTop: 14, background: status.isError ? 'rgba(255,59,48,0.06)' : 'rgba(52,199,89,0.06)' }}>
              {status.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleTestConnection} disabled={testing || syncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, color: 'var(--ink-soft)', border: '1px solid var(--paper-edge, #e5e5e7)', borderRadius: 8, background: 'var(--surface-raised, #fff)', cursor: 'pointer', opacity: testing || syncing ? 0.5 : 1 }}>
              <Wifi size={13} />{testing ? t('sync.testing') : t('sync.testConnection')}
            </button>
            <button onClick={handleSave} disabled={saving || syncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, fontWeight: 500, borderRadius: 8, background: '#4A90E2', color: '#fff', border: 'none', cursor: 'pointer', opacity: saving || syncing ? 0.6 : 1, boxShadow: '0 2px 6px rgba(74,144,226,.25)' }}>
              <Save size={13} />{saving ? t('sync.saving') : t('sync.saveConfig')}
            </button>
            <button onClick={handleSync} disabled={syncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, fontWeight: 500, borderRadius: 8, background: 'var(--surface-raised, #fff)', color: 'var(--ink-soft)', border: '1px solid var(--paper-edge, #e5e5e7)', cursor: 'pointer', opacity: syncing ? 0.6 : 1 }}>
              <RefreshCw size={13} className={syncing ? 'spin' : ''} />{syncing ? `${pct}%` : t('sync.syncNow')}
            </button>
          </div>
        </div>
        )}

        {/* ── LAN tab ── */}
        {tab === 'lan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Host sub-section */}
          {canHost && (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--paper-edge, #eee)' }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>本机作为主机</div>
              <button onClick={toggleHost} disabled={lanBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: lanBusy ? 'not-allowed' : 'pointer', opacity: lanBusy ? 0.6 : 1, border: hostStatus.running ? '1px solid rgba(255,59,48,0.25)' : 'none', background: hostStatus.running ? 'rgba(255,59,48,0.08)' : '#4A90E2', color: hostStatus.running ? '#ff3b30' : '#fff', boxShadow: hostStatus.running ? 'none' : '0 2px 6px rgba(74,144,226,.25)' }}>
                {hostStatus.running ? '停止共享' : '开启共享'}
              </button>
              {hostStatus.running && hostStatus.url && hostStatus.pin && (
                <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.2)', display: 'flex', gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...labelStyle, marginBottom: 4 }}>地址</div>
                    <code style={{ fontSize: 12, padding: '3px 7px', borderRadius: 6, background: 'var(--surface-raised, #fff)', border: '1px solid var(--paper-edge, #e5e5e7)', userSelect: 'all', wordBreak: 'break-all', display: 'block' }}>{hostStatus.url}</code>
                  </div>
                  <div>
                    <div style={{ ...labelStyle, marginBottom: 4 }}>PIN</div>
                    <strong style={{ fontSize: 22, letterSpacing: 5, color: 'var(--ink, #2A2722)', fontFamily: 'monospace' }}>{hostStatus.pin}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nearby devices */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--paper-edge, #eee)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={labelStyle}>附近设备</div>
              <button onClick={scanNearby} disabled={scanning || lanBusy}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer', opacity: scanning ? 0.6 : 1 }}>
                {scanning ? '扫描中…' : '扫描'}
              </button>
            </div>
            {nearby.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-mute, #8A8377)' }}>{scanning ? '正在查找附近设备…' : '未发现附近设备'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {nearby.map(s => (
                  <div key={s.url} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-raised, #fff)', border: '1px solid var(--paper-edge, #eee)' }}>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <span style={{ fontWeight: 500, color: 'var(--ink, #2A2722)' }}>{s.libraryName || s.deviceName}</span>
                      <span style={{ color: 'var(--ink-mute, #8A8377)', fontSize: 12 }}> · {s.deviceName}</span>
                    </div>
                    {pairedIds.has(s.deviceId) ? (
                      <button onClick={() => syncWith(s.url)} disabled={lanBusy}
                        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer' }}>同步</button>
                    ) : (
                      <button onClick={() => { setPeerUrl(s.url); connectNearby(s.url) }} disabled={lanBusy}
                        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4A90E2', color: '#fff', cursor: 'pointer' }}>连接</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* PIN input — only show when there are unpaired nearby devices to connect */}
            {nearby.some(s => !pairedIds.has(s.deviceId)) && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...inputStyle, width: 120, flex: 'none' }} type="text" inputMode="numeric" placeholder="6 位 PIN"
                  value={peerPin} onChange={(e) => setPeerPin(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={lanBusy} autoFocus />
                <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>填入对方显示的 PIN，再点「连接」</span>
              </div>
            )}
          </div>

          {/* Manual connect */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--paper-edge, #eee)' }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>手动连接</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} type="text" placeholder="http://192.168.x.x:端口"
                value={peerUrl} onChange={(e) => setPeerUrl(e.target.value)} disabled={lanBusy} />
              <input style={{ ...inputStyle, width: 100, flex: 'none' }} type="text" inputMode="numeric" placeholder="6 位 PIN"
                value={peerPin} onChange={(e) => setPeerPin(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={lanBusy} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => peerUrl && connectNearby(peerUrl)} disabled={lanBusy}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#4A90E2', color: '#fff', cursor: 'pointer', opacity: lanBusy ? 0.6 : 1 }}>连接</button>
              <button onClick={() => peerUrl && syncWith(peerUrl)} disabled={lanBusy}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--paper-edge, #e5e5e7)', background: 'var(--surface-raised, #fff)', cursor: 'pointer', opacity: lanBusy ? 0.6 : 1 }}>同步</button>
            </div>
          </div>

          {/* Paired devices */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>已配对设备</div>
            {pairedDevices.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-mute, #8A8377)' }}>暂无配对设备</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {pairedDevices.map(d => {
                  const onlineUrl = nearby.find(n => n.deviceId === d.peerDeviceId)?.url
                  return (
                    <div key={d.peerDeviceId} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-raised, #fff)', border: '1px solid var(--paper-edge, #eee)' }}>
                      <div style={{ flex: 1, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 500, color: 'var(--ink, #2A2722)' }}>{d.peerDeviceName || d.peerDeviceId}</span>
                          <span style={{ fontSize: 11, color: onlineUrl ? '#34c759' : 'var(--ink-mute)', background: onlineUrl ? 'rgba(52,199,89,0.1)' : 'var(--paper-edge, #eee)', padding: '1px 6px', borderRadius: 10 }}>
                            {onlineUrl ? '在线' : '未发现'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-mute, #8A8377)' }}>{new Date(d.linkedAt).toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {onlineUrl && (
                          <button onClick={() => syncWith(onlineUrl)} disabled={lanBusy}
                            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#4A90E2', color: '#fff', cursor: 'pointer', opacity: lanBusy ? 0.6 : 1 }}>
                            同步
                          </button>
                        )}
                        <button onClick={() => unpair(d.peerDeviceId)} disabled={lanBusy}
                          style={{ fontSize: 12, color: '#c0392b', background: 'none', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                          断开
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {lanMsg && (
            <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: lanMsg.includes('失败') ? 'rgba(255,59,48,0.06)' : 'rgba(52,199,89,0.06)', color: lanMsg.includes('失败') ? '#ff3b30' : 'var(--ink-soft)' }}>
              {lanMsg}
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  )
}
