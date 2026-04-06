# KuroSeed - Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                            BROWSER (localhost:3000)                              │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                         SINGLE PAGE APP (index.html)                   │     │
│  │                                                                         │     │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │     │
│  │   │Watchlist  │  │ Search   │  │  Logs    │  │     Settings         │   │     │
│  │   │          │  │ (Nyaa)   │  │          │  │                      │   │     │
│  │   │ Poster   │  │          │  │ Status   │  │ qBittorrent URL/Auth │   │     │
│  │   │ Status   │  │ Raw RSS  │  │ Episode  │  │ Download Folder      │   │     │
│  │   │ Episodes │  │ Results  │  │ Errors   │  │ Watch Folder         │   │     │
│  │   │ Actions  │  │          │  │          │  │ Cron Interval        │   │     │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘   │     │
│  │                                                                         │     │
│  │   ┌─────────────────────── WIZARD (fullscreen) ───────────────────┐    │     │
│  │   │                                                                │    │     │
│  │   │  STEP 1              STEP 2            STEP 3       STEP 4    │    │     │
│  │   │  Find Anime  ──►    Configure  ──►    Confirm  ──► Progress   │    │     │
│  │   │                                                                │    │     │
│  │   │  Search MAL          Fansub group      Summary      Adding..  │    │     │
│  │   │  Poster grid         Quality           All config   Checking..│    │     │
│  │   │  Score/Episodes      Last EP           Poster       Torrents..│    │     │
│  │   │  Select one          Folder picker     Review       qBit..    │    │     │
│  │   │                                                     ✓ Done!   │    │     │
│  │   │  Auto-detects:                                                 │    │     │
│  │   │  - Season number                       Browser                 │    │     │
│  │   │  - Series name                         Notification            │    │     │
│  │   └────────────────────────────────────────────────────────────────┘    │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                 │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                                     │  HTTP API (fetch)
                                     │
┌────────────────────────────────────▼────────────────────────────────────────────┐
│                                                                                 │
│                         EXPRESS SERVER (index.js :3000)                          │
│                                                                                 │
│  ┌─────────────── API ROUTES ───────────────────────────────────────────────┐   │
│  │                                                                           │   │
│  │  /api/anime/search?q=   ──► Jikan API proxy (MAL metadata)               │   │
│  │  /api/search?q=&season= ──► Nyaa RSS search + season filter              │   │
│  │  /api/animes (CRUD)     ──► SQLite anime management                      │   │
│  │  /api/animes/:id/toggle ──► Pause/Resume                                 │   │
│  │  /api/animes/:id/episodes ► Episode history                              │   │
│  │  /api/downloads         ──► Download logs                                │   │
│  │  /api/settings          ──► App configuration                            │   │
│  │  /api/browse?path=      ──► Filesystem folder browser                    │   │
│  │  /api/browse/mkdir      ──► Create folders                               │   │
│  │  /api/check             ──► Manual trigger cron check                    │   │
│  │  /api/qbt/test          ──► Test qBittorrent connection                  │   │
│  │  /api/status            ──► Last/next check times                        │   │
│  │                                                                           │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────── CRON JOB (node-cron) ─────────────────────────────────────┐   │
│  │                                                                           │   │
│  │  Runs every 30m / 1h / 2h / 6h (configurable)                            │   │
│  │                                                                           │   │
│  │  For each ACTIVE anime:                                                   │   │
│  │    1. Build Nyaa RSS URL from search_query + fansub + quality             │   │
│  │    2. Fetch & parse RSS feed                                              │   │
│  │    3. Match episodes (regex + season filter + dedup by seeders)           │   │
│  │    4. Skip already-downloaded episodes (DB check)                         │   │
│  │    5. Download .torrent files                                             │   │
│  │    6. Send to qBittorrent for video download                              │   │
│  │    7. Log results to DB                                                   │   │
│  │                                                                           │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└──────┬──────────────┬──────────────┬──────────────┬─────────────────────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌────────────┐ ┌────────────────┐
│   db.js     │ │ nyaa.js  │ │ matcher.js │ │ downloader.js  │
│             │ │          │ │            │ │                │
│ SQLite3     │ │ RSS      │ │ Episode    │ │ .torrent       │
│ (WAL mode)  │ │ Fetch &  │ │ detection  │ │ download &     │
│             │ │ Parse    │ │ & season   │ │ folder         │
│ 4 tables:   │ │          │ │ matching   │ │ organization   │
│ - settings  │ │ Strips   │ │            │ │                │
│ - animes    │ │ season   │ │ Patterns:  │ │ Calls:         │
│ - episodes  │ │ text     │ │ "- 09"     │ │ qbittorrent.js │
│ - downloads │ │ from     │ │ "E09"      │ │                │
│             │ │ queries  │ │ "EP09"     │ │ Builds paths:  │
│ CRUD ops    │ │          │ │ "S01E09"   │ │ /Base/Series/  │
│ Duplicate   │ │ URL      │ │ "09v2"     │ │   Season/      │
│ prevention  │ │ encoding │ │            │ │     videos     │
│             │ │ [group]  │ │ Filters:   │ │     .torrents/ │
│             │ │ → %5B %5D│ │ - fansub   │ │                │
│             │ │          │ │ - quality  │ │                │
│             │ │          │ │ - season   │ │                │
│             │ │          │ │ - best     │ │                │
│             │ │          │ │   seeders  │ │                │
└─────────────┘ └─────┬────┘ └────────────┘ └───────┬────────┘
                      │                              │
                      │                              │
       ┌──────────────▼──────────┐    ┌──────────────▼──────────────┐
       │                         │    │                              │
       │       EXTERNAL          │    │      qbittorrent.js          │
       │                         │    │                              │
       │  ┌───────────────────┐  │    │  Login (session cookie)      │
       │  │    Nyaa.si        │  │    │  Add torrent (file or URL)   │
       │  │    RSS Feed       │  │    │  Test connection             │
       │  │                   │  │    │                              │
       │  │ nyaa.si/?page=rss │  │    └──────────────┬───────────────┘
       │  │ &q=%5BErai-raws   │  │                   │
       │  │ %5D+anime+1080p  │  │                   │ HTTP API
       │  │ &c=1_2&f=0       │  │                   │ /api/v2/
       │  └───────────────────┘  │                   │
       │                         │    ┌──────────────▼───────────────┐
       │  ┌───────────────────┐  │    │                              │
       │  │  Jikan API (MAL)  │  │    │   qBittorrent Client         │
       │  │                   │  │    │   (localhost:8080)            │
       │  │ api.jikan.moe/v4  │  │    │                              │
       │  │ /anime?q=...      │  │    │   Receives .torrent ──►      │
       │  │                   │  │    │   Downloads video files       │
       │  │ Returns:          │  │    │   to organized folders        │
       │  │ - Poster          │  │    │                              │
       │  │ - Score           │  │    └──────────────────────────────┘
       │  │ - Episodes        │  │
       │  │ - Synopsis        │  │
       │  │ - Year/Type       │  │
       │  └───────────────────┘  │
       │                         │
       └─────────────────────────┘


═══════════════════════════════════════════════════════════════════
                        DOWNLOAD FLOW
═══════════════════════════════════════════════════════════════════

  User adds anime via Wizard
           │
           ▼
  ┌─────────────────┐     ┌──────────────────┐
  │ Search "jujutsu  │────►│  Jikan API       │
  │ kaisen"          │     │  Returns metadata │
  └────────┬─────────┘     └──────────────────┘
           │ User selects
           ▼
  ┌─────────────────┐
  │ Configure:       │
  │ - Erai-raws      │
  │ - 1080p          │
  │ - Last EP: 0     │
  │ - Folder: /Anime │
  └────────┬─────────┘
           │ Confirm & Save
           ▼
  ┌─────────────────┐     ┌──────────────────────────────────┐
  │ Save to SQLite   │────►│ Trigger check (POST /api/check)  │
  └─────────────────┘     └───────────────┬──────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │  Nyaa RSS Query:               │
                          │  [Erai-raws] Jujutsu Kaisen    │
                          │  Shimetsu Kaiyuu Zenpen 1080p  │
                          └───────────────┬───────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │  matcher.js filters:           │
                          │  ✓ Fansub matches              │
                          │  ✓ Quality matches             │
                          │  ✓ Season OK (no conflict)     │
                          │  ✓ Episode > last downloaded   │
                          │  ✓ Not in DB yet               │
                          │  ✓ Best seeders per episode    │
                          └───────────────┬───────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │  For each new episode:         │
                          │                               │
                          │  1. Download .torrent file     │
                          │     from nyaa.si               │
                          │                               │
                          │  2. Save to organized folder:  │
                          │     /Anime/                    │
                          │       Jujutsu Kaisen/          │
                          │         Shimetsu Kaiyuu.../    │
                          │           .torrents/           │
                          │             EP01.torrent       │
                          │             EP02.torrent       │
                          │                               │
                          │  3. Send to qBittorrent API    │
                          │     savepath = video folder    │
                          │                               │
                          │  4. Log to SQLite              │
                          └───────────────┬───────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │  qBittorrent downloads video:  │
                          │                               │
                          │  /Anime/                       │
                          │    Jujutsu Kaisen/             │
                          │      Shimetsu Kaiyuu.../       │
                          │        EP01.mkv  ← video      │
                          │        EP02.mkv  ← video      │
                          │        .torrents/              │
                          │          EP01.torrent          │
                          │          EP02.torrent          │
                          └───────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                        FOLDER STRUCTURE
═══════════════════════════════════════════════════════════════════

  /Selected Download Folder/
  │
  ├── Jujutsu Kaisen/                      ← Serie
  │   ├── Season 1/                        ← S1 (sin subtítulo)
  │   │   ├── [videos .mkv]
  │   │   └── .torrents/
  │   ├── 2nd Season/                      ← S2
  │   │   ├── [videos .mkv]
  │   │   └── .torrents/
  │   └── Shimetsu Kaiyuu - Zenpen/        ← S3 (nombre de arco)
  │       ├── [videos .mkv]
  │       └── .torrents/
  │
  ├── My Hero Academia/
  │   └── Season 7/
  │       ├── [videos .mkv]
  │       └── .torrents/
  │
  └── One Piece/
      └── Season 1/
          ├── [videos .mkv]
          └── .torrents/


═══════════════════════════════════════════════════════════════════
                        DATABASE SCHEMA
═══════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────┐
  │                   settings                       │
  ├─────────────────────┬───────────────────────────┤
  │ key (PK)            │ value                     │
  ├─────────────────────┼───────────────────────────┤
  │ qbittorrent_url     │ http://localhost:8080     │
  │ qbittorrent_username│ admin                     │
  │ qbittorrent_password│ ****                      │
  │ qbittorrent_watch.. │ /path/to/watch            │
  │ default_download..  │ /path/to/downloads        │
  │ cron_interval       │ 60                        │
  │ last_cron_run       │ 2026-04-05T12:00:00Z      │
  │ next_cron_run       │ 2026-04-05T13:00:00Z      │
  └─────────────────────┴───────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │                        animes                                 │
  ├──────────────────────┬───────────────────────────────────────┤
  │ id (PK)              │ INTEGER AUTOINCREMENT                 │
  │ name                 │ "Jujutsu Kaisen: Shimetsu..."         │
  │ search_query         │ "Jujutsu Kaisen: Shimetsu..."         │
  │ fansub_group         │ "Erai-raws"                           │
  │ quality              │ "1080p"                               │
  │ download_folder      │ "/Anime"                              │
  │ season               │ 3                                     │
  │ last_downloaded_ep   │ 12                                    │
  │ status               │ "active" | "paused"                   │
  │ image_url            │ "https://cdn.myanimelist.net/..."     │
  │ mal_id               │ 51009                                 │
  │ total_episodes       │ 12                                    │
  │ score                │ 8.67                                  │
  │ synopsis             │ "Kenjaku, the one known as..."        │
  │ last_check_time      │ datetime                              │
  │ created_at           │ datetime                              │
  │ updated_at           │ datetime                              │
  └──────────────────────┴───────────────────────────────────────┘
          │ 1
          │
          │ N
  ┌───────▼──────────────────────────────────────────────────────┐
  │                       episodes                                │
  ├──────────────────────┬───────────────────────────────────────┤
  │ id (PK)              │ INTEGER AUTOINCREMENT                 │
  │ anime_id (FK)        │ → animes.id (CASCADE DELETE)          │
  │ episode_number       │ 9                                     │
  │ title                │ "[Erai-raws] Jujutsu Kaisen..."      │
  │ torrent_url          │ "https://nyaa.si/download/..."        │
  │ file_size            │ "988.6 MiB"                           │
  │ downloaded_at        │ datetime                              │
  ├──────────────────────┴───────────────────────────────────────┤
  │ UNIQUE(anime_id, episode_number) ← prevents duplicates      │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │                      downloads (log)                          │
  ├──────────────────────┬───────────────────────────────────────┤
  │ id (PK)              │ INTEGER AUTOINCREMENT                 │
  │ anime_id (FK)        │ → animes.id (CASCADE DELETE)          │
  │ episode_number       │ 9                                     │
  │ status               │ "success" | "failed" | "error"        │
  │ message              │ "Downloaded JJK_S3_E09.torrent"       │
  │ torrent_url          │ "https://nyaa.si/download/..."        │
  │ file_name            │ "JJK_S3_E09_Erai-raws.torrent"       │
  │ created_at           │ datetime                              │
  └──────────────────────┴───────────────────────────────────────┘
```
