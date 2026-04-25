import React from 'react'

interface Props {
  onOpen: (path: string) => void
}

export default function WelcomeView({ onOpen }: Props) {
  const handleCreate = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    const result = await window.electronAPI.library.init(dir)
    onOpen(result.rootPath)
  }

  const handleOpen = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    try {
      const result = await window.electronAPI.library.open(dir)
      onOpen(result.rootPath)
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '16px',
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>半卷闲书</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>腹有诗书气自华</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="primary" onClick={handleCreate}>创建书房</button>
        <button onClick={handleOpen}>打开书房</button>
      </div>
    </div>
  )
}
