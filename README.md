# KuroSeed

<p align="center">
  <img src="public/favicon.svg" width="80" alt="KuroSeed">
</p>

<p align="center">
  <strong>Local anime auto-downloader with built-in torrent engine</strong><br>
  No cloud. No accounts. Everything stays on your machine.
</p>

<p align="center">
  <a href="https://onilabs.site">Built by onilabs.site</a> ·
  <a href="https://ko-fi.com/onilabs">Support us on Ko-fi</a>
</p>

---

## What is KuroSeed?

KuroSeed monitors Nyaa.si RSS feeds and automatically downloads new anime episodes as they release. It runs entirely on your local machine — no cloud servers, no subscriptions, no accounts.

Search anime by name, pick the one you want, and KuroSeed handles the rest: checking for new episodes, downloading torrents, and organizing your files.

## Quick Start

```bash
git clone https://github.com/onilabs/kuroseed.git
cd kuroseed
npm install
node index.js
```

Open **http://localhost:3000** in your browser.

## Features

- **Wizard-based setup** — Search anime from MyAnimeList with cover art, scores, and episode info
- **Built-in torrent engine** — Downloads videos directly, no external torrent client needed
- **Auto-download** — Checks for new episodes on a configurable schedule (30m to 6h)
- **Smart matching** — Handles fansub groups, quality preferences, season detection, and episode deduplication
- **Organized folders** — Auto-creates `Series / Season / episodes + .torrents/` structure
- **Real-time progress** — Download speed, ETA, and progress bars in the UI
- **Auto-complete** — Pauses tracking when anime finishes airing and all episodes are downloaded
- **Browser notifications** — Get notified when new episodes are found and downloaded
- **Grid & list views** — Switch between poster grid and detailed list
- **Bilingual** — English and Spanish UI
- **Optional qBittorrent** — Use the built-in engine or connect to qBittorrent if you prefer

## Privacy & Data

> **KuroSeed does not store anything in the cloud.**

| Data | Location |
|------|----------|
| Anime watchlist & settings | Local SQLite database (`kuroseed.db`) |
| .torrent files | Your configured download folder |
| Downloaded videos (media) | Your configured download folder |
| Anime metadata (covers, scores) | Fetched from Jikan API, cached in local DB |

The only external network calls are:
- **Nyaa.si** — RSS feed queries to find new episodes
- **Jikan API** — Anime metadata from MyAnimeList (covers, episode count, scores)

No telemetry. No analytics. No user accounts. No data leaves your machine.

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — System design, module responsibilities, data flow diagrams
- **[How It Works](docs/HOW-IT-WORKS.md)** — Step-by-step explanation of the download pipeline

## System Requirements

- **Node.js** 18+
- **macOS / Windows / Linux**
- Internet connection for Nyaa.si RSS and torrent downloading

### First Run on macOS
macOS will ask to allow incoming network connections for Node.js — click **Allow**. This is required for the torrent engine to receive data from peers.

### First Run on Windows
Windows Firewall will prompt to allow Node.js — check **Private networks** and click **Allow access**.

## Configuration

All settings are in the web UI under **Settings**:

| Setting | Description |
|---------|-------------|
| Download Engine | Built-in (WebTorrent) or qBittorrent |
| Download Folder | Where videos and .torrent files are saved |
| Check Interval | How often to check for new episodes |
| Language | English or Spanish |

## Support the Project

If KuroSeed is useful to you, consider supporting development:

<a href="https://ko-fi.com/onilabs">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi">
</a>

Every contribution helps us keep building free, open-source tools.

## License

MIT

---

<p align="center">
  Built with care by <a href="https://onilabs.site">onilabs.site</a>
</p>
