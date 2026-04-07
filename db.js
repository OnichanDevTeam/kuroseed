const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getDatabasePath() {
  // Dev/server mode keeps DB in project root for easy inspection.
  if (!process.versions.electron) {
    return path.join(__dirname, 'kuroseed.db');
  }

  // Installed Electron app should store writable data in user profile.
  try {
    const { app } = require('electron');
    if (app) {
      return path.join(app.getPath('userData'), 'kuroseed.db');
    }
  } catch {}

  // Fallback for rare early-init cases.
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || __dirname;
  return path.join(appData, 'KuroSeed', 'kuroseed.db');
}

const dbPath = getDatabasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS animes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    search_query TEXT NOT NULL,
    fansub_group TEXT NOT NULL DEFAULT 'Erai-raws',
    quality TEXT NOT NULL DEFAULT '1080p',
    download_folder TEXT,
    season INTEGER NOT NULL DEFAULT 1,
    last_downloaded_episode INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    last_check_time TEXT,
    image_url TEXT,
    mal_id INTEGER,
    total_episodes INTEGER,
    score REAL,
    synopsis TEXT,
    airing_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT,
    torrent_url TEXT,
    file_size TEXT,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (anime_id) REFERENCES animes(id) ON DELETE CASCADE,
    UNIQUE(anime_id, episode_number)
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id INTEGER NOT NULL,
    episode_number INTEGER,
    status TEXT NOT NULL,
    message TEXT,
    torrent_url TEXT,
    file_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (anime_id) REFERENCES animes(id) ON DELETE CASCADE
  );
`);

// Migration: add airing_status column if missing
try {
  db.exec('ALTER TABLE animes ADD COLUMN airing_status TEXT');
} catch {
  // Column already exists
}

// Migration: add is_batch column to episodes if missing
try {
  db.exec('ALTER TABLE episodes ADD COLUMN is_batch INTEGER DEFAULT 0');
} catch {
  // Column already exists
}

// Default settings
const defaultSettings = {
  download_engine: 'builtin',
  qbittorrent_url: '',
  qbittorrent_username: 'admin',
  qbittorrent_password: '',
  qbittorrent_watch_folder: '',
  default_download_folder: '',
  cron_interval: '60',
  last_cron_run: '',
  next_cron_run: '',
};

const upsertSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

for (const [key, value] of Object.entries(defaultSettings)) {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!existing) {
    upsertSetting.run(key, value);
  }
}

module.exports = {
  db,

  // Settings
  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  setSetting(key, value) {
    upsertSetting.run(key, String(value));
  },

  getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    return settings;
  },

  // Animes
  getAllAnimes() {
    return db.prepare('SELECT * FROM animes ORDER BY name').all();
  },

  getActiveAnimes() {
    return db.prepare("SELECT * FROM animes WHERE status = 'active' ORDER BY name").all();
  },

  getAnime(id) {
    return db.prepare('SELECT * FROM animes WHERE id = ?').get(id);
  },

  addAnime({ name, search_query, fansub_group, quality, download_folder, season, last_downloaded_episode, image_url, mal_id, total_episodes, score, synopsis, airing_status }) {
    const stmt = db.prepare(`
      INSERT INTO animes (name, search_query, fansub_group, quality, download_folder, season, last_downloaded_episode, image_url, mal_id, total_episodes, score, synopsis, airing_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, search_query, fansub_group || 'Erai-raws', quality || '1080p', download_folder || '', season || 1, last_downloaded_episode || 0, image_url || null, mal_id || null, total_episodes || null, score || null, synopsis || null, airing_status || null);
    return result.lastInsertRowid;
  },

  updateAnime(id, fields) {
    const allowed = ['name', 'search_query', 'fansub_group', 'quality', 'download_folder', 'season', 'last_downloaded_episode', 'status', 'last_check_time', 'image_url', 'mal_id', 'total_episodes', 'score', 'synopsis', 'airing_status'];
    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE animes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },

  deleteAnime(id) {
    db.prepare('DELETE FROM animes WHERE id = ?').run(id);
  },

  // Episodes
  getEpisodes(animeId) {
    return db.prepare('SELECT * FROM episodes WHERE anime_id = ? ORDER BY episode_number DESC').all(animeId);
  },

  hasEpisode(animeId, episodeNumber) {
    const row = db.prepare('SELECT id FROM episodes WHERE anime_id = ? AND episode_number = ?').get(animeId, episodeNumber);
    return !!row;
  },

  addEpisode({ anime_id, episode_number, title, torrent_url, file_size, is_batch }) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO episodes (anime_id, episode_number, title, torrent_url, file_size, is_batch)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(anime_id, episode_number, title || '', torrent_url || '', file_size || '', is_batch ? 1 : 0);
  },

  // Downloads (log)
  addDownloadLog({ anime_id, episode_number, status, message, torrent_url, file_name }) {
    db.prepare(`
      INSERT INTO downloads (anime_id, episode_number, status, message, torrent_url, file_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(anime_id, episode_number || null, status, message || '', torrent_url || '', file_name || '');
  },

  getDownloadLogs(animeId, limit = 50) {
    return db.prepare('SELECT * FROM downloads WHERE anime_id = ? ORDER BY created_at DESC LIMIT ?').all(animeId, limit);
  },

  getAllDownloadLogs(limit = 100) {
    return db.prepare(`
      SELECT d.*, a.name as anime_name
      FROM downloads d
      LEFT JOIN animes a ON d.anime_id = a.id
      ORDER BY d.created_at DESC LIMIT ?
    `).all(limit);
  },
};
