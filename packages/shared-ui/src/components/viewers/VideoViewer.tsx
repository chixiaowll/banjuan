import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Play, Pause, PanelLeft, PanelRight, FileText, Camera, Trash2 } from 'lucide-react'
import { useBanjuanAPI } from '../../api.js'
import { useResizable, ResizeHandle } from '../ResizeHandle.js'
import NotesPanel from './NotesPanel.js'
import PdfNoteSidebar from './PdfNoteSidebar.js'
import TagInput from '../tags/TagInput.js'
import { useT } from '../../i18n/index.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  filePath: string
  docPath: string
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

interface Screenshot {
  id: string
  time: number
  dataUrl: string
}

const POSITION_KEY = (id: string) => `banjuan-video-pos-${id}`
const SCREENSHOTS_KEY = (id: string) => `banjuan-video-screenshots-${id}`

function loadScreenshots(docId: string): Screenshot[] {
  try {
    const raw = localStorage.getItem(SCREENSHOTS_KEY(docId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveScreenshots(docId: string, list: Screenshot[]) {
  try { localStorage.setItem(SCREENSHOTS_KEY(docId), JSON.stringify(list)) } catch {}
}

export default function VideoViewer({ filePath, docPath, doc, onOpenNote }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const positionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimeRef = useRef(0)

  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [leftTab, setLeftTab] = useState<'screenshots' | 'notes'>('screenshots')
  const [sidebarNoteId, setSidebarNoteId] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Screenshot[]>(() => loadScreenshots(doc.id))

  const leftResize = useResizable(260, 180, 400, 'left')
  const rightResize = useResizable(320, 200, 600, 'right')

  useEffect(() => {
    let revoke: string | null = null
    api.documents.readFileBuffer(docPath).then((buf) => {
      const ext = docPath.split('.').pop()?.toLowerCase() || 'mp4'
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
        avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4',
        ogv: 'video/ogg', flv: 'video/x-flv',
      }
      const blob = new Blob([buf], { type: mimeMap[ext] || 'video/mp4' })
      const url = URL.createObjectURL(blob)
      revoke = url
      setBlobUrl(url)
    }).catch(() => setError('Failed to load video'))
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [docPath])

  // Save playback position on unmount via ref (videoRef may be cleared by React)
  useEffect(() => {
    return () => {
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current)
      if (lastTimeRef.current > 0) {
        localStorage.setItem(POSITION_KEY(doc.id), String(lastTimeRef.current))
      }
    }
  }, [doc.id])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) videoRef.current.pause()
    else videoRef.current.play()
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const t = videoRef.current.currentTime
    setCurrentTime(t)
    lastTimeRef.current = t
    // Debounced save of playback position
    if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current)
    positionSaveTimer.current = setTimeout(() => {
      localStorage.setItem(POSITION_KEY(doc.id), String(lastTimeRef.current))
    }, 3000)
  }

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return
    setDuration(videoRef.current.duration)
    // Restore saved playback position
    const saved = localStorage.getItem(POSITION_KEY(doc.id))
    if (saved) {
      const time = parseFloat(saved)
      if (time > 0 && time < videoRef.current.duration) {
        videoRef.current.currentTime = time
        setCurrentTime(time)
      }
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
      lastTimeRef.current = time
    }
  }

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed)
    if (videoRef.current) videoRef.current.playbackRate = newSpeed
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const min = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0
      ? `${h}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
      : `${min}:${sec.toString().padStart(2, '0')}`
  }

  const takeScreenshot = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    const id = Date.now().toString()
    setScreenshots(prev => {
      const next = [...prev, { id, time: video.currentTime, dataUrl }].sort((a, b) => a.time - b.time)
      saveScreenshots(doc.id, next)
      return next
    })
    setLeftOpen(true)
    setLeftTab('screenshots')
  }, [doc.id])

  const deleteScreenshot = useCallback((id: string) => {
    setScreenshots(prev => {
      const next = prev.filter(s => s.id !== id)
      saveScreenshots(doc.id, next)
      return next
    })
  }, [doc.id])

  const seekToScreenshot = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const handleCreateNote = useCallback(async () => {
    let note: any
    const title = t('note.defaultTitle', doc.title)
    for (let i = 0; i < 100; i++) {
      try {
        note = await api.notes.create({
          title: i === 0 ? title : `${title} (${i + 1})`,
          docId: doc.id,
          content: '',
        })
        break
      } catch (err: any) {
        if (!err?.message?.includes('DUPLICATE_TITLE')) throw err
      }
    }
    if (note) setSidebarNoteId(note.id)
  }, [doc])

  const handleOpenNote = useCallback((note: any) => {
    setSidebarNoteId(note.id)
    setRightOpen(true)
  }, [])

  const saveScreenshotAsAttachment = useCallback(async (screenshot: Screenshot) => {
    if (!sidebarNoteId) return null
    const res = await fetch(screenshot.dataUrl)
    const buf = await res.arrayBuffer()
    const fileName = `screenshot-${formatTime(screenshot.time).replace(/:/g, '-')}.png`
    return api.attachments.save(sidebarNoteId, fileName, buf)
  }, [sidebarNoteId])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        {error}
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    )
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-primary)', padding: 4, display: 'inline-flex', alignItems: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Toolbar */}
      <div style={{
        padding: '4px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: 'var(--surface)',
      }}>
        <button style={btnStyle} onClick={() => setLeftOpen(v => !v)} title="Toggle left sidebar">
          <PanelLeft size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{ ...btnStyle, gap: 4, fontSize: 12, color: 'var(--accent)' }}
          onClick={takeScreenshot}
          title="Screenshot"
        >
          <Camera size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button style={btnStyle} onClick={() => setRightOpen(v => !v)} title="Toggle right sidebar">
          <PanelRight size={16} />
        </button>
      </div>

      {/* Tags */}
      <div style={{
        padding: '4px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      }}>
        <TagInput targetId={doc.id} targetType="document" compact />
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar */}
        {leftOpen && (
          <>
            <div style={{
              width: leftResize.width, display: 'flex', flexDirection: 'column',
              flexShrink: 0, background: 'var(--bg)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {([['screenshots', <Camera size={14} />], ['notes', <FileText size={14} />]] as const).map(([id, icon]) => (
                  <button
                    key={id}
                    onClick={() => setLeftTab(id)}
                    style={{
                      flex: 1, padding: '8px 0', border: 'none',
                      background: leftTab === id ? 'var(--bg)' : 'var(--surface)',
                      borderBottom: leftTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                      cursor: 'pointer', color: leftTab === id ? 'var(--text)' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12,
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {leftTab === 'screenshots' && (
                  <div style={{ padding: 8 }}>
                    {screenshots.length === 0 && (
                      <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                        {t('video.noScreenshots' as any) || 'No screenshots yet'}
                      </div>
                    )}
                    {screenshots.map(s => (
                      <div
                        key={s.id}
                        style={{
                          marginBottom: 8, borderRadius: 6, overflow: 'hidden',
                          border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                        onClick={() => seekToScreenshot(s.time)}
                      >
                        <img src={s.dataUrl} style={{ width: '100%', display: 'block' }} />
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)',
                          background: 'var(--surface)',
                        }}>
                          <span>{formatTime(s.time)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteScreenshot(s.id) }}
                            style={{ ...btnStyle, color: 'var(--text-muted)', padding: 2 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {leftTab === 'notes' && (
                  <NotesPanel
                    docId={doc.id}
                    onOpenNote={handleOpenNote}
                    onCreateNote={handleCreateNote}
                    onDeleteNote={(noteId) => { if (sidebarNoteId === noteId) setSidebarNoteId(null) }}
                  />
                )}
              </div>
            </div>
            <ResizeHandle onPointerDown={leftResize.onPointerDown} />
          </>
        )}

        {/* Video area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#000', minHeight: 0,
          }}>
            <video
              ref={videoRef}
              src={blobUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={togglePlay}
              style={{ maxWidth: '100%', maxHeight: '100%', cursor: 'pointer' }}
            />
          </div>
          {/* Controls */}
          <div style={{
            padding: '8px 16px', background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <button onClick={togglePlay} style={btnStyle}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <span style={{ fontSize: 12, minWidth: 45, color: 'var(--text-muted)' }}>{formatTime(currentTime)}</span>
            <input
              type="range" min={0} max={duration || 0} step={0.1}
              value={currentTime} onChange={handleSeek}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, minWidth: 45, color: 'var(--text-muted)' }}>{formatTime(duration)}</span>
            <select
              value={speed}
              onChange={(e) => changeSpeed(parseFloat(e.target.value))}
              style={{
                background: 'var(--surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 4px', fontSize: 12,
              }}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>

        {/* Right sidebar */}
        {(rightOpen || sidebarNoteId) && (
          <>
            <ResizeHandle onPointerDown={rightResize.onPointerDown} />
            {sidebarNoteId ? (
              <PdfNoteSidebar
                noteId={sidebarNoteId}
                onClose={() => setSidebarNoteId(null)}
                onOpenNote={(note) => setSidebarNoteId(note.id)}
                width={rightResize.width}
              />
            ) : (
              <div style={{
                width: rightResize.width, borderLeft: 'none',
                display: 'flex', flexDirection: 'column', flexShrink: 0,
                background: 'var(--bg)', overflow: 'auto',
              }}>
                <div style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  {doc.title}
                </div>
                <div style={{ padding: '8px 0', fontSize: 12 }}>
                  <div style={{ display: 'flex', padding: '4px 12px', gap: 8 }}>
                    <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>Type</span>
                    <span>{doc.type.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', padding: '4px 12px', gap: 8 }}>
                    <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>Path</span>
                    <span style={{ wordBreak: 'break-all' }}>{doc.path}</span>
                  </div>
                  <div style={{ display: 'flex', padding: '4px 12px', gap: 8 }}>
                    <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>Created</span>
                    <span>{new Date(doc.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
