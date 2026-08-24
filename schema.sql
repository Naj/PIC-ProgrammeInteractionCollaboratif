-- PIC — schéma D1
-- Application : npx wrangler d1 execute pic --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS tasks (
  space      TEXT NOT NULL,
  id         TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  echeance   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space, id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_space_updated ON tasks (space, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (space, deleted, archived, echeance);

CREATE TABLE IF NOT EXISTS meta (
  space      TEXT PRIMARY KEY,
  columns    TEXT,
  settings   TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subs (
  endpoint   TEXT PRIMARY KEY,
  space      TEXT NOT NULL,
  p256dh     TEXT,
  auth       TEXT,
  created_at TEXT NOT NULL,
  last_sent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_subs_space ON subs (space);
