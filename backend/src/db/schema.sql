CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  tier          TEXT NOT NULL DEFAULT 'free',
  trees_used    INTEGER NOT NULL DEFAULT 0,
  trees_limit   INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS trees (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  root_paper  TEXT NOT NULL,
  tree_data   TEXT NOT NULL,
  depth       INTEGER NOT NULL DEFAULT 3,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trees_user_id ON trees(user_id);

CREATE TABLE IF NOT EXISTS reading_list (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id    TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  authors     TEXT NOT NULL DEFAULT '[]',
  year        INTEGER,
  venue       TEXT NOT NULL DEFAULT '',
  arxiv_or_doi TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  saved_from  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_list_user_paper
  ON reading_list(user_id, paper_id);
