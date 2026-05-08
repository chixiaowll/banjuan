import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, Check, X } from 'lucide-react'
import ColorPicker from '../components/tags/ColorPicker.js'
import { useT } from '../i18n/index.js'
import { useBanjuanAPI } from '../api.js'

interface TagWithCount {
  id: string
  name: string
  color: string | null
  count: number
}

export default function TagManagerView() {
  const api = useBanjuanAPI()
  const t = useT()
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count'>('count')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadTags = useCallback(async () => {
    const list = await api.tags.listWithCounts()
    setTags(list)
  }, [])

  useEffect(() => { loadTags() }, [loadTags])

  const filtered = tags
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'count' ? b.count - a.count : a.name.localeCompare(b.name))

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    await api.tags.create({ name: trimmed })
    setNewName('')
    setShowCreate(false)
    await loadTags()
  }

  const handleRename = async (tagId: string) => {
    const trimmed = editValue.trim()
    if (!trimmed) return
    await api.tags.rename(tagId, trimmed)
    setEditingId(null)
    await loadTags()
  }

  const handleDelete = async (tagId: string) => {
    await api.tags.delete(tagId)
    setConfirmDeleteId(null)
    await loadTags()
  }

  const handleColorChange = async (tagId: string, color: string) => {
    await api.tags.updateColor(tagId, color)
    await loadTags()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{t('tags.manager')}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 6, color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tags.search')}
              style={{
                fontSize: 12, padding: '4px 8px 4px 24px', width: 180,
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
          <button onClick={() => setSortBy(sortBy === 'count' ? 'name' : 'count')}
            style={{ fontSize: 11, padding: '4px 8px' }}>
            {sortBy === 'count' ? t('tags.sortByName') : t('tags.sortByCount')}
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} />{t('tags.newTag')}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          padding: '8px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
            placeholder={t('tags.name')}
            style={{
              fontSize: 12, padding: '4px 8px', flex: 1,
              border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
            }}
          />
          <button onClick={handleCreate} style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} />{t('common.confirm')}
          </button>
          <button onClick={() => { setShowCreate(false); setNewName('') }}
            style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={14} />{t('common.cancel')}
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px',
          padding: '10px 0', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          <span>{t('tags.name')}</span>
          <span>{t('tags.color')}</span>
          <span style={{ textAlign: 'center' }}>{t('tags.count')}</span>
          <span style={{ textAlign: 'right' }}>{t('tags.actions')}</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('tags.noTags')}
          </div>
        )}
        {filtered.map((tag) => (
          <div key={tag.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px',
            padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 13,
          }}>
            <div>
              {editingId === tag.id ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                    style={{
                      fontSize: 12, padding: '2px 6px', flex: 1,
                      border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                    }}
                  />
                  <span onClick={() => handleRename(tag.id)} style={{ cursor: 'pointer', color: 'var(--accent)', display: 'inline-flex' }}><Check size={14} /></span>
                  <span onClick={() => setEditingId(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={14} /></span>
                </div>
              ) : (
                <span>{tag.name}</span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <span
                onClick={() => setColorPickerId(colorPickerId === tag.id ? null : tag.id)}
                style={{
                  display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                  background: tag.color || '#737a84', cursor: 'pointer',
                  border: '1px solid var(--border)',
                }}
              />
              {colorPickerId === tag.id && (
                <ColorPicker
                  value={tag.color}
                  onChange={(color) => handleColorChange(tag.id, color)}
                  onClose={() => setColorPickerId(null)}
                />
              )}
            </div>
            <span style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{tag.count}</span>
            <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span
                onClick={() => { setEditingId(tag.id); setEditValue(tag.name) }}
                title={t('tags.rename')}
                style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}
              ><Pencil size={14} /></span>
              {confirmDeleteId === tag.id ? (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span onClick={() => handleDelete(tag.id)} style={{ cursor: 'pointer', color: '#c44040', fontSize: 11 }}>{t('common.confirm')}</span>
                  <span onClick={() => setConfirmDeleteId(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>{t('common.cancel')}</span>
                </span>
              ) : (
                <span
                  onClick={() => setConfirmDeleteId(tag.id)}
                  title={t('tags.delete')}
                  style={{ cursor: 'pointer', color: '#c44040', display: 'inline-flex' }}
                ><Trash2 size={14} /></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
