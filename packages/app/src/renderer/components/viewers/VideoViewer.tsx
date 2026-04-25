import React, { useRef, useState } from 'react'

interface Props {
  filePath: string
}

export default function VideoViewer({ filePath }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed)
    if (videoRef.current) videoRef.current.playbackRate = newSpeed
  }

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          src={`file://${filePath}`}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setPlaying(false)}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
      </div>
      <div style={{
        padding: '12px 16px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={togglePlay} style={{ minWidth: 40 }}>
          {playing ? '⏸' : '▶'}
        </button>
        <span style={{ fontSize: 12, minWidth: 45 }}>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, minWidth: 45 }}>{formatTime(duration)}</span>
        <select
          value={speed}
          onChange={(e) => changeSpeed(parseFloat(e.target.value))}
          style={{
            background: 'var(--surface)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', fontSize: 12,
          }}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  )
}
