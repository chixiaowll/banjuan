import { useEffect, useState, useSyncExternalStore } from 'react'
import { useBanjuanAPI, PoetryCard } from '@banjuan/shared-ui'
import { listLibraries, getLibrariesRoot, type LibraryEntry } from './capacitor-api.js'

interface Props {
  onOpen: (path: string, name: string) => void
}

type NearbyShare = { deviceId: string; deviceName: string; libraryName: string; libraryId: string; url: string }

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  // 从附近设备加入
  const [nearby, setNearby] = useState<NearbyShare[]>([])
  const [scanning, setScanning] = useState(false)
  const [joinTarget, setJoinTarget] = useState<NearbyShare | null>(null)
  const [joinPin, setJoinPin] = useState('')

  useEffect(() => {
    listLibraries().then(setLibraries)
  }, [])

  const refreshLibraries = async () => setLibraries(await listLibraries())

  const handleOpen = async (entry: LibraryEntry) => {
    setLoading(entry.path)
    setError(null)
    try {
      await api.library.open(entry.path)
      onOpen(entry.path, entry.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  const slugDir = (name: string): string => {
    const base = name.replace(/[^a-zA-Z0-9一-鿿 _-]/g, '').replace(/\s+/g, '_') || `Library_${Date.now()}`
    const existing = new Set(libraries.map(l => l.path.split('/').pop()))
    if (!existing.has(base)) return base
    let i = 2
    while (existing.has(`${base}_${i}`)) i++
    return `${base}_${i}`
  }

  const handleCreate = async () => {
    const name = newName.trim() || '我的书房'
    const path = `${getLibrariesRoot()}/${slugDir(name)}`
    setLoading(path)
    setError(null)
    try {
      await api.library.init(path, name)
      onOpen(path, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(null)
    }
  }

  const scan = async () => {
    setScanning(true)
    setError(null)
    try { setNearby(await api.lan.scanNearby()) } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setScanning(false) }
  }

  // Tapping a discovered host: if this book-room is already on the device, just
  // open it; otherwise ask for the PIN and join (create + pair + first sync).
  const tapNearby = (h: NearbyShare) => {
    const already = libraries.find(l => l.id && l.id === h.libraryId)
    if (already) { handleOpen(already); return }
    setJoinTarget(h)
    setJoinPin('')
    setError(null)
  }

  const confirmJoin = async () => {
    if (!joinTarget) return
    if (!/^\d{6}$/.test(joinPin)) { setError('请输入对方显示的 6 位 PIN'); return }
    const h = joinTarget
    const name = h.libraryName || h.deviceName || '书房'
    const path = `${getLibrariesRoot()}/${slugDir(name)}`
    setLoading(path)
    setError(null)
    try {
      await api.library.init(path, name)        // create + open an empty local book-room
      await api.lan.pairDevice(h.url, joinPin)   // store the durable token
      await api.lan.syncDevice(h.url)            // empty room adopts host's id + pulls content
      await refreshLibraries()
      onOpen(path, name)
    } catch (err) {
      setError(`加入失败:${err instanceof Error ? err.message : String(err)}`)
      setLoading(null)
    }
  }

  const windowWidth = useSyncExternalStore(
    (cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) },
    () => window.innerWidth,
  )
  const isWide = windowWidth >= 768

  const ink = 'var(--ink, #2A2722)'
  const mute = 'var(--ink-mute, #8A8377)'
  const edge = 'var(--paper-edge, #e7e2d6)'
  const surface = 'var(--surface-raised, #fff)'

  const containerStyle: React.CSSProperties = {
    padding: isWide ? '60px 48px env(safe-area-inset-bottom)' : '56px 22px env(safe-area-inset-bottom)',
    maxWidth: isWide ? 680 : 460,
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  }
  const sectionLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: mute, margin: '0 0 10px' }
  const cardStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 12, border: `1px solid ${edge}`, background: surface,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
  }
  const primaryBtn: React.CSSProperties = {
    border: 'none', background: ink, color: '#fff', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500,
  }

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 6px', color: ink }}>半卷闲书</h1>
        <p style={{ fontSize: 14, color: mute, margin: '0 0 20px' }}>腹有诗书气自华</p>
        <PoetryCard />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(196,64,64,0.08)', color: '#c44040', fontSize: 13, marginBottom: 16, wordBreak: 'break-all' }}>
          {error}
        </div>
      )}

      {/* 已有的书房 */}
      {libraries.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabel}>我的书房</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {libraries.map(lib => (
              <div key={lib.path} style={cardStyle} onClick={() => loading ? null : handleOpen(lib)}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--accent-soft, #f3ede1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>📚</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lib.name}</div>
                {loading === lib.path && <div style={{ fontSize: 13, color: mute }}>打开中…</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 从附近设备一键加入 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={sectionLabel}>从附近设备加入</div>
          <button onClick={scan} disabled={scanning || loading !== null}
            style={{ fontSize: 13, padding: '5px 12px', borderRadius: 8, border: `1px solid ${edge}`, background: surface, color: ink, cursor: 'pointer' }}>
            {scanning ? '扫描中…' : '扫描'}
          </button>
        </div>
        {nearby.length === 0 ? (
          <div style={{ fontSize: 13, color: mute }}>{scanning ? '正在查找…' : '点"扫描"查找同一 Wi-Fi 下共享的设备'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nearby.map(h => {
              const joined = libraries.some(l => l.id && l.id === h.libraryId)
              return (
                <div key={h.url} style={cardStyle} onClick={() => loading ? null : tapNearby(h)}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--accent-soft, #f3ede1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📶</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.libraryName || h.deviceName}</div>
                    <div style={{ fontSize: 12, color: mute, marginTop: 2 }}>{h.deviceName}{joined ? ' · 已加入,点按打开' : ''}</div>
                  </div>
                  <div style={{ fontSize: 13, color: joined ? mute : 'var(--accent, #2f6fd8)' }}>{joined ? '打开' : '加入'}</div>
                </div>
              )
            })}
          </div>
        )}
        {joinTarget && (
          <div style={{ marginTop: 12, padding: 16, borderRadius: 12, border: `1px solid ${edge}`, background: surface }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: ink, marginBottom: 4 }}>加入「{joinTarget.libraryName || joinTarget.deviceName}」</div>
            <div style={{ fontSize: 12, color: mute, marginBottom: 12 }}>输入对方设备上显示的 6 位 PIN</div>
            <input type="text" inputMode="numeric" placeholder="6 位 PIN" value={joinPin} autoFocus
              onChange={e => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${edge}`, fontSize: 16, letterSpacing: 4, boxSizing: 'border-box', marginBottom: 12 }}
              onKeyDown={e => e.key === 'Enter' && confirmJoin()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setJoinTarget(null); setJoinPin('') }} disabled={loading !== null}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${edge}`, background: 'transparent', color: ink, fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={confirmJoin} disabled={loading !== null}
                style={{ ...primaryBtn, flex: 1, padding: '10px', opacity: loading ? 0.6 : 1 }}>
                {loading ? '加入中…' : '加入并同步'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新建书房 */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: `2px dashed ${edge}`, background: 'transparent', cursor: 'pointer', fontSize: 15, color: mute, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>+</span> 新建书房
        </button>
      ) : (
        <div style={{ padding: 18, borderRadius: 12, border: `1px solid ${edge}`, background: surface }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: ink, marginBottom: 12 }}>新建书房</div>
          <input type="text" placeholder="书房名称" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${edge}`, fontSize: 15, boxSizing: 'border-box', marginBottom: 12 }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowCreate(false); setNewName('') }}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${edge}`, background: 'transparent', color: ink, fontSize: 14, cursor: 'pointer' }}>取消</button>
            <button onClick={handleCreate} disabled={loading !== null}
              style={{ ...primaryBtn, flex: 1, padding: '10px', opacity: loading ? 0.6 : 1 }}>
              {loading ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
