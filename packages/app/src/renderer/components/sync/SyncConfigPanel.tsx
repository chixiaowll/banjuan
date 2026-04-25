import React, { useEffect, useState } from 'react'

interface SyncConfig {
  url: string
  username: string
  password: string
  remotePath: string
}

interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  errors: string[]
}

interface Props {
  onClose: () => void
}

export default function SyncConfigPanel({ onClose }: Props) {
  const [config, setConfig] = useState<SyncConfig>({
    url: '',
    username: '',
    password: '',
    remotePath: '/banjuan',
  })
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const existing = await (window as any).electronAPI.sync.getConfig()
        if (existing) {
          setConfig({
            url: existing.url ?? '',
            username: existing.username ?? '',
            password: existing.password ?? '',
            remotePath: existing.remotePath ?? '/banjuan',
          })
        }
      } catch {
        // no existing config, keep defaults
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await (window as any).electronAPI.sync.saveConfig(config)
      setStatus({ message: '配置已保存', isError: false })
    } catch (err: any) {
      setStatus({ message: `保存失败：${err?.message ?? String(err)}`, isError: true })
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setStatus(null)
    try {
      const result: SyncResult = await (window as any).electronAPI.sync.run()
      const { uploaded, downloaded, deletedLocal, deletedRemote, errors } = result
      if (errors && errors.length > 0) {
        setStatus({ message: `同步完成（有错误）：${errors.join('；')}`, isError: true })
      } else {
        setStatus({
          message: `同步成功 — 上传 ${uploaded}，下载 ${downloaded}，本地删除 ${deletedLocal}，远端删除 ${deletedRemote}`,
          isError: false,
        })
      }
    } catch (err: any) {
      setStatus({ message: `同步失败：${err?.message ?? String(err)}`, isError: true })
    } finally {
      setSyncing(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-muted)',
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', margin: 0 }}>WebDAV 同步配置</h2>
          <button onClick={onClose} style={{ fontSize: '16px', lineHeight: 1, padding: '2px 8px' }}>×</button>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>WebDAV 地址</label>
          <input
            style={inputStyle}
            type="url"
            placeholder="https://example.com/dav"
            value={config.url}
            onChange={(e) => setConfig(c => ({ ...c, url: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>用户名</label>
          <input
            style={inputStyle}
            type="text"
            value={config.username}
            onChange={(e) => setConfig(c => ({ ...c, username: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>密码</label>
          <input
            style={inputStyle}
            type="password"
            value={config.password}
            onChange={(e) => setConfig(c => ({ ...c, password: e.target.value }))}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>远端路径</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="/banjuan"
            value={config.remotePath}
            onChange={(e) => setConfig(c => ({ ...c, remotePath: e.target.value }))}
          />
        </div>

        {status && (
          <div style={{
            fontSize: '13px',
            color: status.isError ? '#f38ba8' : '#a6e3a1',
            padding: '8px 10px',
            borderRadius: '4px',
            border: `1px solid ${status.isError ? '#f38ba8' : '#a6e3a1'}`,
          }}>
            {status.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="primary"
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1 }}
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ flex: 1 }}
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      </div>
    </div>
  )
}
