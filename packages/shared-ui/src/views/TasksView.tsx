import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task } from '@banjuan/core'
import { useBanjuanAPI } from '../api.js'
import { useI18n, LOCALE_TAGS } from '../i18n/index.js'
import { toast, errorMessage } from '../components/feedback.js'
import { requestNoteBlock } from '../utils/noteNavigation.js'

/**
 * The to-do list: every open checkbox of every note, by project. Checking one
 * writes it back to its note; its text opens the note at that line.
 */

type Filter = 'all' | 'today' | 'overdue' | 'week'

const DAY = 86_400_000
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function TasksView() {
  const api = useBanjuanAPI()
  const { t, locale } = useI18n()
  const [open, setOpen] = useState<Task[] | null>(null)
  const [done, setDone] = useState<Task[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [project, setProject] = useState<string>('')
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api.tasks) return
    try {
      setOpen(await api.tasks.list({ status: 'open' }))
      setDone(showDone ? await api.tasks.list({ status: 'done', doneSince: localDay(new Date(Date.now() - 7 * DAY)) }) : [])
    } catch (e) {
      toast.error(errorMessage(e))
      setOpen([])
    }
  }, [api, showDone])
  useEffect(() => { void load() }, [load])

  // Checkboxes are ticked in notes, by programs and in other windows too.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load() }, 300) }
    document.addEventListener('banjuan:note-content-changed', soon)
    document.addEventListener('notes-changed', soon)
    const off = api.library.onExternalChange?.(soon)
    return () => { document.removeEventListener('banjuan:note-content-changed', soon); document.removeEventListener('notes-changed', soon); off?.(); if (timer) clearTimeout(timer) }
  }, [api, load])

  const today = localDay(new Date())
  const weekEnd = localDay(new Date(Date.now() + (7 - ((new Date().getDay() + 6) % 7) - 1) * DAY))   // this Sunday
  const projects = useMemo(() => [...new Set((open ?? []).map(x => x.project))].sort((a, b) => a.localeCompare(b, LOCALE_TAGS[locale])), [open, locale])

  const shown = (open ?? []).filter(x =>
    (!project || x.project === project) &&
    (filter === 'all' ? true
      : filter === 'today' ? x.due === today
      : filter === 'overdue' ? !!x.due && x.due < today
      : !!x.due && x.due >= today && x.due <= weekEnd))
  const groups = new Map<string, Task[]>()
  for (const task of [...shown, ...(showDone ? done.filter(x => !project || x.project === project) : [])]) {
    const list = groups.get(task.project) ?? []
    list.push(task)
    groups.set(task.project, list)
  }

  const toggle = async (task: Task) => {
    if (!api.tasks) return
    setBusy(task.id)
    try { await api.tasks.setDone(task.id, !task.done) }
    catch (e) { toast.error(errorMessage(e)) }
    finally { setBusy(null); void load() }
  }

  const openTask = (task: Task) => {
    requestNoteBlock(task.note.id, task.id)
    document.dispatchEvent(new CustomEvent('note-link-click', { detail: { noteId: task.note.id } }))
  }

  const daysOpen = (task: Task) => Math.max(0, Math.floor((Date.now() - new Date(task.firstSeen).getTime()) / DAY))
  // Near dates in words ("due today", "overdue by 3 days"), others as a date.
  const dueLabel = (task: Task) => {
    const left = Math.round((new Date(`${task.due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / DAY)
    if (task.done) return t('tasks.dueOn', date(task.due!))
    return left < 0 ? t('tasks.overdueDays', -left) : left === 0 ? t('tasks.dueToday') : left === 1 ? t('tasks.dueTomorrow') : t('tasks.dueOn', date(task.due!))
  }
  const counts: Record<Filter, number> = {
    all: (open ?? []).length,
    today: (open ?? []).filter(x => x.due === today).length,
    overdue: (open ?? []).filter(x => !!x.due && x.due < today).length,
    week: (open ?? []).filter(x => !!x.due && x.due >= today && x.due <= weekEnd).length,
  }
  const date = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(LOCALE_TAGS[locale], { month: 'short', day: 'numeric' })

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text)',
  })

  if (!api.tasks) return null

  return (
    <div style={{ padding: 24, overflow: 'auto', flex: 1 }} data-tasks-view>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>{t('tasks.title')}</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tasks.subtitle')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['all', 'today', 'overdue', 'week'] as const).map(f => (
          <button key={f} data-task-filter={f} onClick={() => setFilter(f)} style={chip(filter === f)}>
            {t(f === 'all' ? 'tasks.filterAll' : f === 'today' ? 'tasks.filterToday' : f === 'overdue' ? 'tasks.filterOverdue' : 'tasks.filterWeek')}
            {open && <span style={{ marginLeft: 5, opacity: 0.7, color: f === 'overdue' && counts.overdue > 0 ? '#c0392b' : undefined }}>{counts[f]}</span>}
          </button>
        ))}
        <select value={project} onChange={e => setProject(e.target.value)} data-task-project
          style={{ fontSize: 12, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">{t('tasks.allProjects')}</option>
          {projects.map(p => <option key={p} value={p}>{p || t('tasks.noProject')}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', cursor: 'pointer' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} data-task-show-done />
          {t('tasks.showDone')}
        </label>
      </div>

      {open && groups.size === 0 && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('tasks.empty')}</div>
      )}

      {[...groups.entries()].map(([name, tasks]) => (
        <div key={name || '-'} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 4px 4px' }}>
            {name || t('tasks.noProject')} <span style={{ fontWeight: 400 }}>· {tasks.filter(x => !x.done).length}</span>
          </div>
          {tasks.map(task => {
            const overdue = !task.done && !!task.due && task.due < today
            return (
              <div key={task.id} data-task-id={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)', opacity: busy === task.id ? 0.5 : 1 }}>
                <input type="checkbox" checked={task.done} disabled={busy !== null} onChange={() => toggle(task)} style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => openTask(task)} title={t('tasks.openNote')}
                    style={{ fontSize: 13, cursor: 'pointer', textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--text-muted)' : 'var(--text)' }}>
                    {task.priority && <span style={{ fontSize: 11, fontWeight: 600, color: task.priority === 'P0' ? '#c0392b' : 'var(--accent)', marginRight: 6 }}>{task.priority}</span>}
                    {task.text}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {task.due && <span title={date(task.due)} style={overdue ? { color: '#c0392b', fontWeight: 600 } : task.due === today && !task.done ? { color: '#d35400', fontWeight: 600 } : undefined}>{dueLabel(task)}</span>}
                    {task.done && task.doneAt ? <span>{t('tasks.doneOn', date(task.doneAt))}</span> : <span>{t('tasks.openDays', daysOpen(task))}</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.note.title}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
