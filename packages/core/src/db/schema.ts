import type Database from 'better-sqlite3'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT DEFAULT '[]',
    path TEXT NOT NULL,
    type TEXT NOT NULL,
    hash TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    type TEXT NOT NULL,
    page INTEGER,
    position TEXT NOT NULL,
    content TEXT,
    selected_text TEXT,
    color TEXT DEFAULT 'yellow',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    doc_id TEXT,
    folder_id TEXT,
    content_format TEXT DEFAULT 'json',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS note_links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    context TEXT,
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id),
    FOREIGN KEY (target_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS note_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_annotations (
    note_id TEXT NOT NULL,
    annotation_id TEXT NOT NULL,
    PRIMARY KEY (note_id, annotation_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE IF NOT EXISTS doc_tags (
    doc_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (doc_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS mindmap_tags (
    mindmap_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (mindmap_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    title, content, type,
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    doc_id TEXT,
    layout TEXT DEFAULT 'mindmap',
    theme TEXT DEFAULT 'classic',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    node_type TEXT DEFAULT 'text',
    annotation_id TEXT,
    note_id TEXT,
    doc_id TEXT,
    hyperlink TEXT,
    image_url TEXT,
    tag_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT,
    notes TEXT,
    shape TEXT,
    style_overrides TEXT,
    position_x REAL,
    position_y REAL,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT,
    style TEXT
);
`

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)

  // Migrate mindmap_nodes: add new columns if missing
  const nodeColumns = db.pragma('table_info(mindmap_nodes)') as Array<{ name: string }>
  const nodeColNames = new Set(nodeColumns.map(c => c.name))
  const newNodeCols: Array<[string, string]> = [
    ['node_type', "TEXT DEFAULT 'text'"],
    ['note_id', 'TEXT'],
    ['doc_id', 'TEXT'],
    ['hyperlink', 'TEXT'],
    ['image_url', 'TEXT'],
    ['tag_id', 'TEXT'],
    ['notes', 'TEXT'],
    ['shape', 'TEXT'],
    ['style_overrides', 'TEXT'],
  ]
  for (const [name, type] of newNodeCols) {
    if (!nodeColNames.has(name)) {
      db.exec(`ALTER TABLE mindmap_nodes ADD COLUMN ${name} ${type}`)
    }
  }
  // Migrate mindmaps: add theme column if missing
  const mmColumns = db.pragma('table_info(mindmaps)') as Array<{ name: string }>
  const mmColNames = new Set(mmColumns.map(c => c.name))
  if (!mmColNames.has('theme')) {
    db.exec("ALTER TABLE mindmaps ADD COLUMN theme TEXT DEFAULT 'classic'")
  }
}
