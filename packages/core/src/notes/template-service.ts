import type { PlatformDatabase } from '../platform/index.js'
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

export class TemplateService {
  private builtinsSeeded = false

  constructor(private db: PlatformDatabase) {}

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

  async list(): Promise<NoteTemplate[]> {
    this.ensureBuiltins()
    const rows = this.db.query<TemplateRow>('SELECT * FROM note_templates ORDER BY sort_order ASC, created_at ASC')
    return rows.map(rowToTemplate)
  }

  async get(id: string): Promise<NoteTemplate | null> {
    this.ensureBuiltins()
    const row = this.db.queryOne<TemplateRow>('SELECT * FROM note_templates WHERE id = ?', [id])
    return row ? rowToTemplate(row) : null
  }

  async create(input: NoteTemplateCreateInput): Promise<NoteTemplate> {
    const id = uuid()
    const now = new Date().toISOString()
    const maxOrder = this.db.queryOne<{ max_order: number | null }>('SELECT MAX(sort_order) as max_order FROM note_templates')
    const sortOrder = (maxOrder?.max_order ?? 0) + 1

    this.db.run(
      'INSERT INTO note_templates (id, name, description, content, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
      [id, input.name, input.description ?? '', input.content, sortOrder, now, now],
    )

    return {
      id,
      name: input.name,
      description: input.description ?? '',
      content: input.content,
      isBuiltin: false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async update(id: string, updates: Partial<NoteTemplateCreateInput>): Promise<NoteTemplate> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Template not found: ${id}`)

    const now = new Date().toISOString()
    const name = updates.name ?? existing.name
    const description = updates.description ?? existing.description
    const content = updates.content ?? existing.content

    this.db.run(
      'UPDATE note_templates SET name = ?, description = ?, content = ?, updated_at = ? WHERE id = ?',
      [name, description, content, now, id],
    )

    return { ...existing, name, description, content, updatedAt: now }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Template not found: ${id}`)
    if (existing.isBuiltin) throw new Error('Cannot delete builtin template')

    this.db.run('DELETE FROM note_templates WHERE id = ?', [id])
  }
}
