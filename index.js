const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const db = require('./db');
const nyaa = require('./nyaa');
const matcher = require('./matcher');
const downloader = require('./downloader');
const qbt = require('./qbittorrent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── State ──────────────────────────────────────────────
let cronTask = null;
let isRunning = false;

// ── Cron check logic ───────────────────────────────────
async function runCheck() {
  if (isRunning) {
    console.log('[KuroSeed] Check already running, skipping...');
    return { skipped: true };
  }

  isRunning = true;
  console.log(`[KuroSeed] Starting check at ${new Date().toISOString()}`);
  db.setSetting('last_cron_run', new Date().toISOString());

  const animes = db.getActiveAnimes();
  const settings = db.getAllSettings();
  const results = [];

  for (const anime of animes) {
    try {
      const items = await nyaa.fetchAnimeRss(anime);
      db.updateAnime(anime.id, { last_check_time: new Date().toISOString() });

      const newEpisodes = matcher.findNewEpisodes(items, anime, db.hasEpisode);

      if (newEpisodes.length === 0) {
        results.push({ anime: anime.name, episodes: 0 });
        continue;
      }

      for (const ep of newEpisodes) {
        try {
          const dlResult = await downloader.downloadAndSave(
            ep.link,
            anime,
            ep.episode_number,
            settings
          );

          const anySuccess = dlResult.results.some((r) => r.success);

          if (anySuccess) {
            db.addEpisode({
              anime_id: anime.id,
              episode_number: ep.episode_number,
              title: ep.title,
              torrent_url: ep.link,
              file_size: ep.size,
            });

            db.updateAnime(anime.id, { last_downloaded_episode: ep.episode_number });

            db.addDownloadLog({
              anime_id: anime.id,
              episode_number: ep.episode_number,
              status: 'success',
              message: `Downloaded ${dlResult.filename}`,
              torrent_url: ep.link,
              file_name: dlResult.filename,
            });

            console.log(`[KuroSeed] Downloaded: ${anime.name} E${ep.episode_number}`);
          } else {
            const errors = dlResult.results.map((r) => r.error).filter(Boolean).join('; ');
            db.addDownloadLog({
              anime_id: anime.id,
              episode_number: ep.episode_number,
              status: 'failed',
              message: errors,
              torrent_url: ep.link,
              file_name: dlResult.filename,
            });
            console.error(`[KuroSeed] Failed: ${anime.name} E${ep.episode_number} - ${errors}`);
          }
        } catch (dlErr) {
          db.addDownloadLog({
            anime_id: anime.id,
            episode_number: ep.episode_number,
            status: 'failed',
            message: dlErr.message,
            torrent_url: ep.link,
          });
          console.error(`[KuroSeed] Download error: ${anime.name} E${ep.episode_number} - ${dlErr.message}`);
        }
      }

      // Auto-pause if anime is finished airing and all episodes downloaded
      const updated = db.getAnime(anime.id);
      if (updated && updated.airing_status && updated.airing_status.toLowerCase().includes('finished')
        && updated.total_episodes && updated.last_downloaded_episode >= updated.total_episodes) {
        db.updateAnime(anime.id, { status: 'paused' });
        console.log(`[KuroSeed] Auto-paused ${anime.name} — all ${updated.total_episodes} episodes downloaded`);
      }

      results.push({ anime: anime.name, episodes: newEpisodes.length });
    } catch (err) {
      db.addDownloadLog({
        anime_id: anime.id,
        status: 'error',
        message: `RSS fetch failed: ${err.message}`,
      });
      console.error(`[KuroSeed] RSS error for ${anime.name}: ${err.message}`);
      results.push({ anime: anime.name, error: err.message });
    }
  }

  isRunning = false;
  console.log(`[KuroSeed] Check complete. Processed ${animes.length} anime(s).`);
  return results;
}

// ── Cron scheduling ────────────────────────────────────
function getCronExpression(intervalMinutes) {
  const mins = parseInt(intervalMinutes, 10);
  if (mins <= 0 || isNaN(mins)) return '0 * * * *'; // default hourly
  if (mins < 60) return `*/${mins} * * * *`;
  const hours = Math.floor(mins / 60);
  return `0 */${hours} * * *`;
}

function startCron() {
  if (cronTask) cronTask.stop();

  const interval = db.getSetting('cron_interval') || '60';
  const expression = getCronExpression(interval);

  cronTask = cron.schedule(expression, () => {
    runCheck().catch((err) => console.error('[KuroSeed] Cron error:', err));
    updateNextRun(interval);
  });

  updateNextRun(interval);
  console.log(`[KuroSeed] Cron scheduled: every ${interval} minutes (${expression})`);
}

function updateNextRun(intervalMinutes) {
  const next = new Date(Date.now() + parseInt(intervalMinutes, 10) * 60 * 1000);
  db.setSetting('next_cron_run', next.toISOString());
}

// ── API Routes ─────────────────────────────────────────

// Settings
app.get('/api/settings', (req, res) => {
  res.json(db.getAllSettings());
});

app.put('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  db.setSetting(key, value);

  if (key === 'cron_interval') {
    startCron();
  }

  res.json({ success: true });
});

app.put('/api/settings/bulk', (req, res) => {
  const settings = req.body;
  for (const [key, value] of Object.entries(settings)) {
    db.setSetting(key, value);
  }
  if ('cron_interval' in settings) {
    startCron();
  }
  res.json({ success: true });
});

// qBittorrent test connection
app.post('/api/qbt/test', async (req, res) => {
  const { url, username, password } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const result = await qbt.testConnection(url, username || 'admin', password || '');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download progress — merges built-in WebTorrent + qBittorrent
app.get('/api/qbt/torrents', async (req, res) => {
  const allTorrents = [];

  // 1. Built-in WebTorrent engine
  try {
    const engine = require('./torrent-engine');
    const builtinTorrents = engine.getAllTorrents();
    allTorrents.push(...builtinTorrents);
  } catch {}

  // 2. qBittorrent (if configured)
  const qbtUrl = db.getSetting('qbittorrent_url');
  const engine = db.getSetting('download_engine') || 'builtin';
  if (qbtUrl && engine === 'qbittorrent') {
    const qbtUser = db.getSetting('qbittorrent_username');
    const qbtPass = db.getSetting('qbittorrent_password');
    try {
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || '');
      const qbtTorrents = await qbt.getTorrents(qbtUrl);
      allTorrents.push(...qbtTorrents.map((t) => ({
        name: t.name,
        hash: t.hash,
        progress: t.progress,
        state: t.state,
        size: t.size,
        downloaded: t.downloaded,
        dlspeed: t.dlspeed,
        eta: t.eta,
        save_path: t.save_path || t.content_path,
        added_on: t.added_on,
      })));
    } catch {}
  }

  res.json(allTorrents);
});

// Remove completed torrents (stop seeding)
app.post('/api/torrents/cleanup', (req, res) => {
  try {
    const engine = require('./torrent-engine');
    const removed = engine.removeCompleted();
    res.json({ removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Animes
app.get('/api/animes', (req, res) => {
  const animes = db.getAllAnimes();
  res.json(animes);
});

app.post('/api/animes', (req, res) => {
  try {
    const id = db.addAnime(req.body);
    res.json({ id, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/animes/:id', (req, res) => {
  db.updateAnime(req.params.id, req.body);
  res.json({ success: true });
});

app.delete('/api/animes/:id', (req, res) => {
  db.deleteAnime(req.params.id);
  res.json({ success: true });
});

app.post('/api/animes/:id/toggle', (req, res) => {
  const anime = db.getAnime(req.params.id);
  if (!anime) return res.status(404).json({ error: 'Not found' });
  const newStatus = anime.status === 'active' ? 'paused' : 'active';
  db.updateAnime(anime.id, { status: newStatus });
  res.json({ status: newStatus });
});

// Episodes
app.get('/api/animes/:id/episodes', (req, res) => {
  res.json(db.getEpisodes(req.params.id));
});

// Download logs
app.get('/api/animes/:id/downloads', (req, res) => {
  res.json(db.getDownloadLogs(req.params.id));
});

app.get('/api/downloads', (req, res) => {
  res.json(db.getAllDownloadLogs());
});

// Jikan anime search proxy (avoids CORS)
app.get('/api/anime/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=12&sfw=true`;
    const response = await new Promise((resolve, reject) => {
      https.get(url, { timeout: 10000 }, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        r.on('error', reject);
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
    });
    res.json(response.data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Browse folders
app.get('/api/browse', (req, res) => {
  let dir = req.query.path || os.homedir();
  dir = path.resolve(dir);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const folders = entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        // Skip hidden folders and system folders
        if (e.name.startsWith('.')) return false;
        // Check readable
        try {
          fs.accessSync(path.join(dir, e.name), fs.constants.R_OK);
          return true;
        } catch {
          return false;
        }
      })
      .map((e) => ({
        name: e.name,
        path: path.join(dir, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(dir);
    res.json({
      current: dir,
      parent: parent !== dir ? parent : null,
      folders,
    });
  } catch (err) {
    res.status(400).json({ error: `Cannot read directory: ${err.message}`, current: dir });
  }
});

// Create folder
app.post('/api/browse/mkdir', (req, res) => {
  const { path: folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Path required' });
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    res.json({ success: true, path: folderPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Search
app.get('/api/search', async (req, res) => {
  const { q, season } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    let results = await nyaa.searchNyaa(q);

    // Filter by season if provided
    if (season) {
      const seasonNum = parseInt(season, 10);
      if (!isNaN(seasonNum)) {
        results = results.filter((item) => matcher.matchesSeason(item.title, seasonNum));
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger
app.post('/api/check', async (req, res) => {
  try {
    const results = await runCheck();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status
app.get('/api/status', (req, res) => {
  res.json({
    isRunning,
    lastRun: db.getSetting('last_cron_run'),
    nextRun: db.getSetting('next_cron_run'),
    cronInterval: db.getSetting('cron_interval'),
    activeAnimes: db.getActiveAnimes().length,
    totalAnimes: db.getAllAnimes().length,
  });
});

// ── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[KuroSeed] Server running at http://localhost:${PORT}`);
  startCron();
});
