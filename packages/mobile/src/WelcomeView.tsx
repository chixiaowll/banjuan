import { useEffect, useState, useSyncExternalStore } from 'react'
import { useBanjuanAPI, PoetryCard, useT } from '@banjuan/shared-ui'
import { listLibraries, getLibrariesRoot, type LibraryEntry } from './capacitor-api.js'

interface Props {
  onOpen: (path: string, name: string) => void
}

type NearbyShare = { deviceId: string; deviceName: string; libraryName: string; libraryId: string; url: string }

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  // Join from nearby device
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
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to open library:', msg, err)
      setError(msg)
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
    const name = newName.trim() || 'My Library'
    const path = `${getLibrariesRoot()}/${slugDir(name)}`
    setLoading(path)
    setError(null)
    try {
      await api.library.init(path, name)
      onOpen(path, name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to create library:', msg, err)
      setError(msg)
      setLoading(null)
    }
  }

  const scan = async () => {
    setScanning(true)
    setError(null)
    try {
      setNearby(await api.lan.scanNearby())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  // Tapping a discovered host: if this library is already on the device, just
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
    if (!/^\d{6}$/.test(joinPin)) { setError(t('welcome.pinRequired')); return }
    const h = joinTarget
    const name = h.libraryName || h.deviceName || 'Library'
    const path = `${getLibrariesRoot()}/${slugDir(name)}`
    setLoading(path)
    setError(null)
    try {
      await api.library.init(path, name)        // create + open an empty local library
      await api.lan.pairDevice(h.url, joinPin)   // store the durable token
      await api.lan.syncDevice(h.url)            // empty library adopts host's id + pulls content
      await refreshLibraries()
      onOpen(path, name)
    } catch (err) {
      setError(t('welcome.joinFailed', err instanceof Error ? err.message : String(err)))
      setLoading(null)
    }
  }

  const windowWidth = useSyncExternalStore(
    (cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) },
    () => window.innerWidth,
  )
  const isWide = windowWidth >= 768

  const containerStyle: React.CSSProperties = {
    padding: isWide ? '60px 48px env(safe-area-inset-bottom)' : '60px 24px env(safe-area-inset-bottom)',
    maxWidth: isWide ? 720 : 480,
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  }

  const cardStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderRadius: 12,
    border: '1px solid var(--border, #e0e0e0)',
    background: 'var(--surface, #fff)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    transition: 'background 0.15s',
  }

  const iconStyle: React.CSSProperties = {
    width: 44, height: 44, borderRadius: 10,
    background: 'linear-gradient(135deg, #228be6, #1c7ed6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 20, flexShrink: 0,
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: 'var(--text-muted, #888)',
    textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: '0 0 12px',
  }

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>Banjuan</h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted, #888)', margin: '0 0 20px' }}>Knowledge Management</p>
        <PoetryCard />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(196,64,64,0.08)', color: '#c44040', fontSize: 13, marginBottom: 16, wordBreak: 'break-all' }}>
          {error}
        </div>
      )}

      {/* Existing libraries */}
      {libraries.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionLabel}>{t('welcome.myLibraries')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {libraries.map(lib => (
              <div key={lib.path} style={cardStyle}
                onClick={() => loading ? null : handleOpen(lib)}>
                <div style={iconStyle}>📚</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lib.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 2 }}>{lib.path.split('/').pop()}</div>
                </div>
                {loading === lib.path && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>{t('welcome.opening')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join from nearby device */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ ...sectionLabel, margin: 0 }}>{t('welcome.joinNearby')}</h2>
          <button onClick={scan} disabled={scanning || loading !== null}
            style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 8,
              border: '1px solid var(--border, #e0e0e0)',
              background: 'var(--surface, #fff)', color: '#228be6',
              cursor: 'pointer', fontWeight: 500,
            }}>
            {scanning ? t('welcome.scanning') : t('welcome.scan')}
          </button>
        </div>
        {nearby.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>{t('welcome.scanHint')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nearby.map(h => {
              const joined = libraries.some(l => l.id && l.id === h.libraryId)
              return (
                <div key={h.url} style={cardStyle} onClick={() => loading ? null : tapNearby(h)}>
                  <div style={iconStyle}>📶</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.libraryName || h.deviceName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 2 }}>
                      {h.deviceName}{joined ? ` · ${t('welcome.joinedTapOpen')}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#228be6', fontWeight: 500 }}>
                    {joined ? t('welcome.open') : t('welcome.join')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {joinTarget && (
          <div style={{ marginTop: 12, padding: 20, borderRadius: 12, border: '1px solid var(--border, #e0e0e0)', background: 'var(--surface, #fff)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {t('welcome.joinTitle', joinTarget.libraryName || joinTarget.deviceName)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginBottom: 12 }}>
              {t('welcome.enterPinHint')}
            </div>
            <input
              type="text" inputMode="numeric"
              placeholder={t('welcome.pinPlaceholder')}
              value={joinPin} autoFocus
              onChange={e => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border, #e0e0e0)', fontSize: 16,
                letterSpacing: 4, boxSizing: 'border-box', marginBottom: 12,
              }}
              onKeyDown={e => e.key === 'Enter' && confirmJoin()}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setJoinTarget(null); setJoinPin('') }} disabled={loading !== null}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
                {t('welcome.cancel')}
              </button>
              <button onClick={confirmJoin} disabled={loading !== null}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#228be6', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? t('welcome.joining') : t('welcome.joinAndSync')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create new library */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: '2px dashed var(--border, #d0d0d0)',
            background: 'transparent', cursor: 'pointer',
            fontSize: 15, color: 'var(--text-muted, #888)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <span style={{ fontSize: 20 }}>+</span> {t('welcome.createLibrary')}
        </button>
      ) : (
        <div style={{ padding: 20, borderRadius: 12, border: '1px solid var(--border, #e0e0e0)', background: 'var(--surface, #fff)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t('welcome.createLibrary')}</div>
          <input
            type="text" placeholder={t('welcome.libraryName')}
            value={newName} onChange={e => setNewName(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border, #e0e0e0)', fontSize: 15,
              boxSizing: 'border-box', marginBottom: 12,
            }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowCreate(false); setNewName('') }}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
              {t('welcome.cancel')}
            </button>
            <button onClick={handleCreate} disabled={loading !== null}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#228be6', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? t('welcome.creating') : t('welcome.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
