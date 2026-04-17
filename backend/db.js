const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function initDB() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'radio.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT DEFAULT 'Unknown',
      album TEXT DEFAULT '',
      filename TEXT NOT NULL UNIQUE,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      plays INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS radio_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      current_index INTEGER NOT NULL DEFAULT 0,
      track_started_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      played_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listener_heartbeats (
      session_id TEXT PRIMARY KEY,
      last_seen INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO radio_state (id, current_index, track_started_at)
    VALUES (1, 0, 0);
  `);

  console.log('[DB] SQLite database initialized');
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

module.exports = { initDB, getDB };
