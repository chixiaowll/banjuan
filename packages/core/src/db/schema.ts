import type { PlatformDatabase } from '../platform/index.js'

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
    type TEXT NOT NULL DEFAULT 'markdown',
    path TEXT NOT NULL,
    doc_id TEXT,
    folder_id TEXT,
    content_format TEXT DEFAULT 'json',
    type_meta TEXT,
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

CREATE TABLE IF NOT EXISTS doc_links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    context TEXT,
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id),
    FOREIGN KEY (target_id) REFERENCES documents(id)
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

CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    hyperlink TEXT,
    image_url TEXT,
    color TEXT,
    notes TEXT,
    shape TEXT,
    style_overrides TEXT,
    position_x REAL,
    position_y REAL,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS mindmap_edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT,
    style TEXT,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS mindmap_boundaries (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    node_ids TEXT NOT NULL DEFAULT '[]',
    label TEXT DEFAULT '',
    color TEXT,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS mindmap_summaries (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    node_ids TEXT NOT NULL DEFAULT '[]',
    summary_node_id TEXT NOT NULL,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id),
    FOREIGN KEY (summary_node_id) REFERENCES mindmap_nodes(id)
);
`

export function initSchema(db: PlatformDatabase): void {
  db.execute(SCHEMA_SQL)

  // Migrate mindmap_nodes: add new columns if missing
  const nodeColumns = db.pragma('table_info(mindmap_nodes)') as Array<{ name: string }>
  const nodeColNames = new Set(nodeColumns.map(c => c.name))
  const newNodeCols: Array<[string, string]> = [
    ['hyperlink', 'TEXT'],
    ['image_url', 'TEXT'],
    ['notes', 'TEXT'],
    ['shape', 'TEXT'],
    ['style_overrides', 'TEXT'],
    ['floating', 'INTEGER DEFAULT 0'],
  ]
  for (const [name, type] of newNodeCols) {
    if (!nodeColNames.has(name)) {
      db.execute(`ALTER TABLE mindmap_nodes ADD COLUMN ${name} ${type}`)
    }
  }
}
