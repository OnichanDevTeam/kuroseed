# How KuroSeed Works

[Back to README](../README.md)

## Overview

KuroSeed automates the full anime download pipeline: **discover → match → download → organize**. Everything runs locally on your machine.

## The Download Pipeline

```
User adds anime via Wizard
         │
         ▼
┌─────────────────────┐
│  1. SEARCH           │  Jikan API (MyAnimeList)
│  User searches by    │  Returns: title, cover, score,
│  name, selects from  │  episodes, airing status
│  MAL results         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  2. CONFIGURE        │  User picks:
│  Fansub group        │  - Erai-raws / SubsPlease / etc.
│  Quality (1080p)     │  - Download folder
│  Last episode seen   │  - Season auto-detected from title
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  3. SAVE TO DB       │  SQLite stores:
│  Anime record with   │  - MAL metadata (cover, score)
│  all config options   │  - Search query = MAL title
│  Status: active       │  - Fansub, quality, folder prefs
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  4. CRON CHECK       │  Runs every 30m/1h/2h/6h
│  For each active     │
│  anime:              │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  5. NYAA RSS QUERY                       │
│                                          │
│  Builds URL like:                        │
│  nyaa.si/?page=rss                       │
│    &q=%5BErai-raws%5D+Jujutsu+Kaisen    │
│       +2nd+Season+1080p                  │
│    &c=1_2&f=0                            │
│                                          │
│  The search query IS the MAL title       │
│  Fansub group brackets are URL-encoded   │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  6. EPISODE MATCHING (matcher.js)        │
│                                          │
│  Filters RSS results through:            │
│  ┌─────────────────────────────────┐     │
│  │ ✓ Fansub group matches?         │     │
│  │ ✓ Quality matches? (1080p)      │     │
│  │ ✓ Season OK? (reject explicit   │     │
│  │   different season numbers)     │     │
│  │ ✓ Search query matches title?   │     │
│  │   (all words must appear in     │     │
│  │   the name portion, not the     │     │
│  │   episode number)               │     │
│  │ ✓ Episode > last downloaded?    │     │
│  │ ✓ Not already in DB?           │     │
│  │ ✓ Best seeders per episode     │     │
│  └─────────────────────────────────┘     │
│                                          │
│  Episode detection patterns:             │
│  "- 09", "- 09v2", "E09", "EP09",       │
│  "S01E09", " 09 "                        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  7. DOWNLOAD .TORRENT FILE               │
│                                          │
│  Fetches from Nyaa:                      │
│  nyaa.si/download/XXXXX.torrent          │
│                                          │
│  Saves to organized folder:              │
│  /Anime/Jujutsu Kaisen/2nd Season/       │
│    .torrents/JJK_S2_E03_Erai-raws.torrent│
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  8. START VIDEO DOWNLOAD                 │
│                                          │
│  Built-in engine (WebTorrent):           │
│  Reads .torrent → connects to peers     │
│  → downloads .mkv to:                    │
│  /Anime/Jujutsu Kaisen/2nd Season/       │
│                                          │
│  OR qBittorrent (if configured):         │
│  Sends .torrent via Web API              │
│  → qBittorrent handles the download     │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  9. LOG & UPDATE                         │
│                                          │
│  - Add episode to DB                     │
│  - Update last_downloaded_episode        │
│  - Log success/failure                   │
│  - If finished airing + all eps done:    │
│    auto-pause the anime                  │
│  - Send browser notification             │
└─────────────────────────────────────────┘
```

## Folder Organization

When you select a download folder (e.g. `/Movies/anime`), KuroSeed automatically creates this structure:

```
/Movies/anime/
├── Jujutsu Kaisen/
│   ├── 2nd Season/
│   │   ├── [Erai-raws] Jujutsu Kaisen 2nd Season - 01.mkv
│   │   ├── [Erai-raws] Jujutsu Kaisen 2nd Season - 02.mkv
│   │   └── .torrents/
│   │       ├── Jujutsu_Kaisen_2nd_Season_S2_E01_Erai-raws.torrent
│   │       └── Jujutsu_Kaisen_2nd_Season_S2_E02_Erai-raws.torrent
│   └── Shimetsu Kaiyuu - Zenpen/
│       ├── [Erai-raws] Jujutsu Kaisen Shimetsu Kaiyuu...01.mkv
│       └── .torrents/
│           └── ...torrent
├── My Hero Academia/
│   └── Season 7/
│       ├── ...mkv
│       └── .torrents/
└── One Piece/
    └── Season 1/
        └── ...
```

**Smart folder detection:** If you select `/Movies/anime/Jujutsu Kaisen` as the folder (already has the series name), KuroSeed won't create a duplicate `Jujutsu Kaisen/Jujutsu Kaisen/` — it detects the overlap.

## Season Detection

Seasons are auto-detected from the anime title selected in MAL:

| MAL Title | Detected Season |
|-----------|----------------|
| Jujutsu Kaisen | 1 |
| Jujutsu Kaisen 2nd Season | 2 |
| My Hero Academia Season 7 | 7 |
| Mob Psycho 100 III | 3 |
| Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen | 1 (arc name, no season number) |

The season number is used for folder naming and `.torrent` filenames, but the real filtering is done by matching the full MAL title against Nyaa torrent titles.

## Cross-Season Protection

A common problem: searching for "Anime Name 2" on Nyaa also returns "Anime Name - 02" (episode 2 of season 1). KuroSeed prevents this by verifying that **all words from the search query appear in the title portion** (before the episode number), not in the episode number itself.

```
Search query: "...Ken 2"
✓ PASS:   "...Ken 2 - 01 [1080p]"     → "Ken 2" found in title
✗ REJECT: "...Ken - 02 [1080p]"       → "2" only in episode number
```

## Data Storage

Everything is stored in a local SQLite database (`kuroseed.db`):

| Table | Purpose |
|-------|---------|
| `animes` | Watchlist entries with config (fansub, quality, folder, MAL metadata) |
| `episodes` | Downloaded episode records (prevents re-downloading) |
| `downloads` | Log of every download attempt (success/failure) |
| `settings` | App configuration (engine, folders, cron interval, language) |

---

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md)
