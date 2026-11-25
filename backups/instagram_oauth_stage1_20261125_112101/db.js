const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dashboard_name TEXT NOT NULL, brand TEXT NOT NULL, ig_username TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  whatsapp_number TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '[]',
  data_mode TEXT NOT NULL DEFAULT 'demo', last_sync TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL, ext_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'Lainnya', date TEXT NOT NULL, url TEXT,
  views INTEGER, reach INTEGER, likes INTEGER, comments INTEGER, saves INTEGER, shares INTEGER, interactions INTEGER,
  UNIQUE(project_id, source, ext_id));
CREATE INDEX IF NOT EXISTS idx_posts_proj ON posts(project_id, source, date);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL, date TEXT NOT NULL, followers INTEGER, UNIQUE(project_id, source, date));
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  username TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'belum_dicek', status_detail TEXT NOT NULL DEFAULT '',
  followers INTEGER, media_count INTEGER, recent TEXT, checked_at TEXT, UNIQUE(project_id, username));
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, hook TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT '', cta TEXT NOT NULL DEFAULT '',
  date TEXT, source TEXT NOT NULL DEFAULT '', ref_link TEXT NOT NULL DEFAULT '', brief TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Ide');
CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hypothesis TEXT NOT NULL, variable TEXT NOT NULL, a TEXT NOT NULL DEFAULT '{}', b TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', UNIQUE(project_id, code));
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL, date TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Inquiry');
CREATE TABLE IF NOT EXISTS meta_conn (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  token_enc TEXT, status TEXT NOT NULL DEFAULT 'belum', error_kind TEXT, error_message TEXT,
  page_id TEXT, page_name TEXT, ig_id TEXT, ig_username TEXT, permissions TEXT, checked_at TEXT);
`);

const clean = (a) => a.map((v) => (v === undefined ? null : v));
module.exports = {
  raw: db,
  all: (sql, ...p) => db.prepare(sql).all(...clean(p)),
  get: (sql, ...p) => db.prepare(sql).get(...clean(p)),
  run: (sql, ...p) => db.prepare(sql).run(...clean(p)),
  tx(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
};
