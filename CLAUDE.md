# KuroSeed - Project Guide

## What is this?
Local anime auto-downloader. Single-page Node.js app that monitors Nyaa.si RSS feeds and downloads anime episodes automatically using a built-in torrent engine (WebTorrent). No cloud, no accounts — everything runs and stores locally on the user's machine.

## Tech Stack
- **Backend:** Node.js + Express + better-sqlite3 + node-cron
- **Frontend:** Single HTML file (`public/index.html`) with vanilla JS, no framework
- **Torrent:** WebTorrent (built-in) or qBittorrent (optional external)
- **Anime metadata:** Jikan API (MyAnimeList proxy)
- **Torrent source:** Nyaa.si RSS

## Project Structure
```
index.js          — Express server, API routes, cron scheduler
db.js             — SQLite schema, migrations, CRUD operations
nyaa.js           — Nyaa.si RSS URL builder and XML parser
matcher.js        — Episode number extraction, season/quality/fansub filtering
downloader.js     — .torrent download + folder organization + engine dispatch
torrent-engine.js — Built-in WebTorrent client wrapper
qbittorrent.js    — qBittorrent Web API client (optional)
public/index.html — Entire frontend (CSS + HTML + JS in one file)
public/favicon.svg— App icon
```

## Key Architecture Decisions
- **Single HTML file:** All UI in one file. Uses a `t()` function for i18n (EN/ES). All static text uses `data-t` attributes.
- **Season detection:** Anime seasons are auto-detected from MAL title patterns. The `matchesSeason()` filter only rejects titles with an explicit DIFFERENT season — arc-named titles (no season indicator) pass through.
- **Search query = MAL title:** The wizard uses the exact MAL title as the Nyaa search query. No manual query editing needed.
- **Folder structure:** Auto-organized as `Base/SeriesName/SeasonOrArcName/` with `.torrents/` subfolder. Detects if user already selected a series folder to avoid duplication.
- **Download engine priority:** Built-in WebTorrent → qBittorrent API → watch folder fallback.

## Common Patterns
- DB migrations use try/catch ALTER TABLE (see `db.js` for `airing_status` column)
- All API responses are JSON
- Frontend polls `/api/qbt/torrents` for download progress (merges built-in + qBittorrent)
- `findNewEpisodes()` in matcher.js is the core filtering pipeline: fansub → quality → season → searchQuery → episode number → dedup by seeders

## Running
```bash
npm install
node index.js
# Open http://localhost:3000
```

## Important: Privacy
No cloud storage. No user accounts. The SQLite DB, .torrent files, and downloaded media all stay on the user's local machine. The only external calls are to Nyaa.si (RSS) and Jikan API (anime metadata).
