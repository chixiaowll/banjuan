import type { PlatformDatabase } from '../platform/index.js'
import { v4 as uuid } from 'uuid'
import type { Folder, FolderCreateInput } from '../types.js'
import type { EventBus } from '../events/bus.js'

export class FolderService {
  constructor(
    private db: PlatformDatabase,
    private events: EventBus,
  ) {}

  async create(input: FolderCreateInput): Promise<Folder> {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.run(
      'INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.name, input.parentId ?? null, 0, now, now],
    )
    const folder: Folder = { id, name: input.name, parentId: input.parentId ?? null, sortOrder: 0, createdAt: now, updatedAt: now }
    this.events.emit('folder:created', { folder })
    return folder
  }

  async get(id: string): Promise<Folder | null> {
    const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM folders WHERE id = ?', [id])
    if (!row) return null
    return this.rowToFolder(row)
  }

  async getTree(): Promise<Folder[]> {
    const rows = this.db.query<Record<string, unknown>>('SELECT * FROM folders ORDER BY sort_order, name')
    const folders = rows.map(r => this.rowToFolder(r))
    const map = new Map<string, Folder>()
    for (const f of folders) { f.children = []; map.set(f.id, f) }
    const roots: Folder[] = []
    for (const f of folders) {
      if (f.parentId && map.has(f.parentId)) { map.get(f.parentId)!.children!.push(f) }
      else { roots.push(f) }
    }
    return roots
  }

  async update(id: string, updates: { name?: string; parentId?: string; sortOrder?: number }): Promise<Folder> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name) }
    if (updates.parentId !== undefined) { sets.push('parent_id = ?'); params.push(updates.parentId) }
    if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(updates.sortOrder) }
    params.push(id)
    this.db.run(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`, params)
    const folder = (await this.get(id))!
    this.events.emit('folder:updated', { folder })
    return folder
  }

  async delete(id: string): Promise<void> {
    this.db.run('UPDATE notes SET folder_id = NULL WHERE folder_id = ?', [id])
    this.db.run('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', [id])
    this.db.run('DELETE FROM folders WHERE id = ?', [id])
    this.events.emit('folder:deleted', { id })
  }

  private rowToFolder(row: Record<string, unknown>): Folder {
    return {
      id: row.id as string, name: row.name as string,
      parentId: row.parent_id as string | null, sortOrder: row.sort_order as number,
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
}
