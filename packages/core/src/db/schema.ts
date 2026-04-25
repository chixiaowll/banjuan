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
    layout TEXT DEFAULT 'tree',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    annotation_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT,
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
}
