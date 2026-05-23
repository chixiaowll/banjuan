import { useEffect, useState, useSyncExternalStore } from 'react'
import { useBanjuanAPI, PoetryCard } from '@banjuan/shared-ui'
import { listLibraries, getLibrariesRoot, type LibraryEntry } from './capacitor-api.js'

interface Props {
  onOpen: (path: string, name: string) => void
}

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    listLibraries().then(setLibraries)
  }, [])

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

  const handleCreate = async () => {
    const name = newName.trim() || 'My Library'
    const dirName = name.replace(/[^a-zA-Z0-9一-鿿 _-]/g, '').replace(/\s+/g, '_') || 'Library_' + Date.now()
    const path = `${getLibrariesRoot()}/${dirName}`
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

      {libraries.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>Libraries</h2>
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
                  <div style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>Opening...</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!showCreate ? (
        <button onClick={() => setShowCreate(true)}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: '2px dashed var(--border, #d0d0d0)',
            background: 'transparent', cursor: 'pointer',
            fontSize: 15, color: 'var(--text-muted, #888)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <span style={{ fontSize: 20 }}>+</span> Create New Library
        </button>
      ) : (
        <div style={{ padding: 20, borderRadius: 12, border: '1px solid var(--border, #e0e0e0)', background: 'var(--surface, #fff)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>New Library</div>
          <input
            type="text" placeholder="Library name"
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
              Cancel
            </button>
            <button onClick={handleCreate} disabled={loading !== null}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#228be6', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
