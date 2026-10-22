import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type { NoteTemplate, NoteTemplateCreateInput } from '../types.js'

const BUILTIN_TEMPLATES = [
  {
    name: '文献笔记',
    description: '用于记录文献阅读笔记的模板',
    content: JSON.stringify([
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '来源信息' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '标题：' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '作者：' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '年份：' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '主要观点' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '关键引用' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '个人思考' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
    ]),
    sortOrder: 1,
  },
  {
    name: 'Zettelkasten 卡片',
    description: '原子化的永久笔记卡片',
    content: JSON.stringify([
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '主题' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '内容' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '关联笔记' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '参考来源' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
    ]),
    sortOrder: 2,
  },
  {
    name: '读书/会议笔记',
    description: '用于读书或会议记录的通用模板',
    content: JSON.stringify([
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '基本信息' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '日期：' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '主题：' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '要点记录' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '行动事项' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '总结' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
    ]),
    sortOrder: 3,
  },
]

interface TemplateRow {
  id: string
  name: string
  description: string | null
  content: string
  is_builtin: number
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToTemplate(row: TemplateRow): NoteTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    content: row.content,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface TemplateFile {
  id: string
  name: string
  description: string
  content: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Note templates. Built-ins are seeded into the DB (and re-seeded after a
 * rebuild); user templates are files in `.banjuan/templates/<id>.json`, so they
 * sync with the library and survive a DB rebuild — they used to live only in
 * the DB cache. Older user templates found only in the DB are moved to files
 * the first time templates are read.
 */
export class TemplateService {
  private builtinsSeeded = false
  private migrated = false
  private readonly dir: string

  constructor(private db: PlatformDatabase, rootPath: string, private fs: PlatformFS) {
    this.dir = join(rootPath, '.banjuan', 'templates')
  }

  private ensureBuiltins(): void {
    if (this.builtinsSeeded) return

    const count = this.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM note_templates WHERE is_builtin = 1')
    if (count && count.cnt === 0) {
      const now = new Date().toISOString()
      for (const tpl of BUILTIN_TEMPLATES) {
        this.db.run(
          'INSERT INTO note_templates (id, name, description, content, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
          [uuid(), tpl.name, tpl.description, tpl.content, tpl.sortOrder, now, now],
        )
      }
    }

    this.builtinsSeeded = true
  }

  /** One-time move of user templates that only exist as DB rows into files. */
  private async migrateDbTemplates(): Promise<void> {
    if (this.migrated) return
    this.migrated = true
    const rows = this.db.query<TemplateRow>('SELECT * FROM note_templates WHERE is_builtin = 0')
    for (const row of rows) {
      const path = this.fileFor(row.id)
      if (!(await this.fs.exists(path))) {
        await this.writeFile({ id: row.id, name: row.name, description: row.description ?? '', content: row.content, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })
      }
    }
    if (rows.length) this.db.run('DELETE FROM note_templates WHERE is_builtin = 0')
  }

  private fileFor(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  private async writeFile(tpl: TemplateFile): Promise<void> {
    await this.fs.mkdir(this.dir, { recursive: true })
    await this.fs.writeTextFile(this.fileFor(tpl.id), JSON.stringify(tpl, null, 2))
  }

  private async readFiles(): Promise<TemplateFile[]> {
    if (!(await this.fs.exists(this.dir))) return []
    const out: TemplateFile[] = []
    for (const name of await this.fs.readdir(this.dir)) {
      if (!name.endsWith('.json')) continue
      try { out.push(JSON.parse(await this.fs.readTextFile(join(this.dir, name)))) }
      catch (e) { console.warn('[templates] unreadable template file', name, e) }
    }
    return out
  }

  private static fromFile(f: TemplateFile): NoteTemplate {
    return { id: f.id, name: f.name, description: f.description ?? '', content: f.content, isBuiltin: false, sortOrder: f.sortOrder ?? 0, createdAt: f.createdAt, updatedAt: f.updatedAt }
  }

  async list(): Promise<NoteTemplate[]> {
    this.ensureBuiltins()
    await this.migrateDbTemplates()
    const builtins = this.db.query<TemplateRow>('SELECT * FROM note_templates WHERE is_builtin = 1 ORDER BY sort_order ASC, created_at ASC').map(rowToTemplate)
    const custom = (await this.readFiles()).map(TemplateService.fromFile)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    return [...builtins, ...custom]
  }

  async get(id: string): Promise<NoteTemplate | null> {
    this.ensureBuiltins()
    await this.migrateDbTemplates()
    const row = this.db.queryOne<TemplateRow>('SELECT * FROM note_templates WHERE id = ?', [id])
    if (row) return rowToTemplate(row)
    try { return TemplateService.fromFile(JSON.parse(await this.fs.readTextFile(this.fileFor(id)))) }
    catch { return null }
  }

  async create(input: NoteTemplateCreateInput): Promise<NoteTemplate> {
    await this.migrateDbTemplates()
    const now = new Date().toISOString()
    const existing = await this.readFiles()
    const tpl: TemplateFile = {
      id: uuid(), name: input.name, description: input.description ?? '', content: input.content,
      sortOrder: existing.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), BUILTIN_TEMPLATES.length) + 1,
      createdAt: now, updatedAt: now,
    }
    await this.writeFile(tpl)
    return TemplateService.fromFile(tpl)
  }

  async update(id: string, updates: Partial<NoteTemplateCreateInput>): Promise<NoteTemplate> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Template not found: ${id}`)
    if (existing.isBuiltin) throw new Error('Cannot modify builtin template')
    const tpl: TemplateFile = {
      id, name: updates.name ?? existing.name, description: updates.description ?? existing.description,
      content: updates.content ?? existing.content, sortOrder: existing.sortOrder, createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    await this.writeFile(tpl)
    return TemplateService.fromFile(tpl)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Template not found: ${id}`)
    if (existing.isBuiltin) throw new Error('Cannot delete builtin template')
    await this.fs.remove(this.fileFor(id))
  }
}
