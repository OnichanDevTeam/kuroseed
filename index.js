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
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
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

      // Fallback: if no individual episodes, look for batch/complete releases
      if (newEpisodes.length === 0) {
        const batchReleases = matcher.findBatchReleases(items, anime);
        if (batchReleases.length === 0) {
          results.push({ anime: anime.name, episodes: 0 });
          continue;
        }

        // Download the best batch (highest seeders, already sorted)
        const batch = batchReleases[0];
        try {
          const dlResult = await downloader.downloadAndSaveBatch(
            batch.link,
            anime,
            batch.episode_range,
            settings
          );

          const anySuccess = dlResult.results.some((r) => r.success);
          const rangeLabel = batch.episode_range
            ? `Ep ${batch.episode_range.start}-${batch.episode_range.end}`
            : 'Complete';

          if (anySuccess) {
            db.addEpisode({
              anime_id: anime.id,
              episode_number: 0,
              title: batch.title,
              torrent_url: batch.link,
              file_size: batch.size,
              is_batch: true,
            });

            // Mark all episodes as downloaded if we know the range or total
            const lastEp = batch.episode_range
              ? batch.episode_range.end
              : (anime.total_episodes || 0);
            if (lastEp > anime.last_downloaded_episode) {
              db.updateAnime(anime.id, { last_downloaded_episode: lastEp });
            }

            db.addDownloadLog({
              anime_id: anime.id,
              episode_number: 0,
              status: 'success',
              message: `Downloaded batch: ${rangeLabel} — ${dlResult.filename}`,
              torrent_url: batch.link,
              file_name: dlResult.filename,
            });

            console.log(`[KuroSeed] Downloaded batch: ${anime.name} (${rangeLabel})`);
          } else {
            const errors = dlResult.results.map((r) => r.error).filter(Boolean).join('; ');
            db.addDownloadLog({
              anime_id: anime.id,
              episode_number: 0,
              status: 'failed',
              message: `Batch failed: ${errors}`,
              torrent_url: batch.link,
              file_name: dlResult.filename,
            });
            console.error(`[KuroSeed] Batch failed: ${anime.name} - ${errors}`);
          }
        } catch (dlErr) {
          db.addDownloadLog({
            anime_id: anime.id,
            episode_number: 0,
            status: 'failed',
            message: `Batch error: ${dlErr.message}`,
            torrent_url: batch.link,
          });
          console.error(`[KuroSeed] Batch error: ${anime.name} - ${dlErr.message}`);
        }

        results.push({ anime: anime.name, episodes: 0, batch: 1 });
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
      // Only auto-pause if there are no active torrents still downloading for this anime
      const updated = db.getAnime(anime.id);
      if (updated && updated.airing_status && updated.airing_status.toLowerCase().includes('finished')
        && updated.total_episodes && updated.last_downloaded_episode >= updated.total_episodes) {
        const torrentEngine = require('./torrent-engine');
        const activeTorrents = torrentEngine.getAllTorrents().filter(
          t => t.meta && t.meta.animeId === anime.id && t.progress < 1
        );
        if (activeTorrents.length === 0) {
          db.updateAnime(anime.id, { status: 'paused' });
          console.log(`[KuroSeed] Auto-paused ${anime.name} — all ${updated.total_episodes} episodes downloaded`);
        }
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

// Pause a torrent
app.post('/api/torrents/:hash/pause', async (req, res) => {
  const hash = req.params.hash;
  const engineSetting = db.getSetting('download_engine') || 'builtin';
  try {
    if (engineSetting === 'builtin') {
      const engine = require('./torrent-engine');
      engine.pauseTorrent(hash);
    } else {
      const qbtUrl = db.getSetting('qbittorrent_url');
      const qbtUser = db.getSetting('qbittorrent_username');
      const qbtPass = db.getSetting('qbittorrent_password');
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || '');
      await qbt.pauseTorrents(qbtUrl, [hash]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume a torrent
app.post('/api/torrents/:hash/resume', async (req, res) => {
  const hash = req.params.hash;
  const engineSetting = db.getSetting('download_engine') || 'builtin';
  try {
    if (engineSetting === 'builtin') {
      const engine = require('./torrent-engine');
      engine.resumeTorrent(hash);
    } else {
      const qbtUrl = db.getSetting('qbittorrent_url');
      const qbtUser = db.getSetting('qbittorrent_username');
      const qbtPass = db.getSetting('qbittorrent_password');
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || '');
      await qbt.resumeTorrents(qbtUrl, [hash]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel/remove a torrent (with optional file deletion)
app.delete('/api/torrents/:hash', async (req, res) => {
  const hash = req.params.hash;
  const deleteFiles = req.query.deleteFiles === 'true';
  const engineSetting = db.getSetting('download_engine') || 'builtin';
  try {
    if (engineSetting === 'builtin') {
      const engine = require('./torrent-engine');
      engine.removeTorrent(hash, deleteFiles);
    } else {
      const qbtUrl = db.getSetting('qbittorrent_url');
      const qbtUser = db.getSetting('qbittorrent_username');
      const qbtPass = db.getSetting('qbittorrent_password');
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || '');
      await qbt.deleteTorrents(qbtUrl, [hash], deleteFiles);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.delete('/api/animes/:id', async (req, res) => {
  const deleteFiles = req.query.deleteFiles === 'true';
  const anime = db.getAnime(req.params.id);

  // Remove associated active torrents
  if (anime) {
    try {
      const engineSetting = db.getSetting('download_engine') || 'builtin';
      if (engineSetting === 'builtin') {
        const engine = require('./torrent-engine');
        const torrents = engine.getAllTorrents();
        const safeName = anime.name.replace(/[<>:"/\\|?*]/g, '').trim().toLowerCase();
        for (const t of torrents) {
          const sp = (t.save_path || '').toLowerCase();
          const tn = (t.name || '').toLowerCase();
          if (sp.includes(safeName) || tn.includes(safeName)) {
            engine.removeTorrent(t.hash, deleteFiles);
          }
        }
      } else {
        const qbtUrl = db.getSetting('qbittorrent_url');
        const qbtUser = db.getSetting('qbittorrent_username');
        const qbtPass = db.getSetting('qbittorrent_password');
        if (qbtUrl) {
          await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || '');
          const torrents = await qbt.getTorrents(qbtUrl);
          const safeName = anime.name.replace(/[<>:"/\\|?*]/g, '').trim().toLowerCase();
          const hashes = torrents
            .filter(t => {
              const sp = (t.save_path || '').toLowerCase();
              const tn = (t.name || '').toLowerCase();
              return sp.includes(safeName) || tn.includes(safeName);
            })
            .map(t => t.hash);
          if (hashes.length) {
            await qbt.deleteTorrents(qbtUrl, hashes, deleteFiles);
          }
        }
      }
    } catch (err) {
      console.error('[KuroSeed] Error removing torrents for anime:', err.message);
    }

    // Delete the series folder (not the base folder!)
    if (deleteFiles) {
      try {
        const baseFolder = anime.download_folder || db.getSetting('default_download_folder') || path.join(__dirname, 'downloads');
        const paths = downloader.buildAnimePaths(baseFolder, anime);
        // Only delete the series-specific directory, never the base folder
        if (paths.seriesDir && paths.seriesDir !== baseFolder && fs.existsSync(paths.seriesDir)) {
          fs.rmSync(paths.seriesDir, { recursive: true, force: true });
          console.log(`[KuroSeed] Deleted series folder: ${paths.seriesDir}`);
        }
      } catch (err) {
        console.error('[KuroSeed] Error deleting folder:', err.message);
      }
    }
  }

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

// Search for alternative torrents (no fansub filter) — used when configured fansub has no results
app.get('/api/search/alternatives', async (req, res) => {
  const { q, quality, season } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const items = await nyaa.searchNyaa(q + (quality ? ' ' + quality : ''));
    const seasonNum = parseInt(season, 10) || 1;

    const results = [];
    for (const item of items) {
      if (!matcher.matchesSeason(item.title, seasonNum)) continue;

      const epNum = matcher.extractEpisodeNumber(item.title);
      const isBatch = matcher.isBatchRelease(item.title);
      if (!epNum && !isBatch) continue;

      // Extract fansub from title [GroupName]
      const fansubMatch = item.title.match(/^\[([^\]]+)\]/);
      const fansub = fansubMatch ? fansubMatch[1] : '';

      results.push({
        title: item.title,
        link: item.link,
        size: item.size,
        seeders: item.seeders,
        fansub,
        is_batch: isBatch,
        episode_number: epNum,
        episode_range: isBatch ? matcher.extractEpisodeRange(item.title) : null,
      });
    }

    // Sort: batches first (by seeders), then individual eps
    results.sort((a, b) => {
      if (a.is_batch !== b.is_batch) return a.is_batch ? -1 : 1;
      return (b.seeders || 0) - (a.seeders || 0);
    });

    res.json(results.slice(0, 15));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download a specific torrent for an anime (used when picking an alternative)
app.post('/api/animes/:id/download-torrent', async (req, res) => {
  const anime = db.getAnime(req.params.id);
  if (!anime) return res.status(404).json({ error: 'Anime not found' });

  const { torrent_url, title, size, is_batch, episode_range } = req.body;
  if (!torrent_url) return res.status(400).json({ error: 'torrent_url required' });

  const settings = db.getAllSettings();

  try {
    let dlResult;
    if (is_batch) {
      dlResult = await downloader.downloadAndSaveBatch(torrent_url, anime, episode_range || null, settings);
    } else {
      const epNum = matcher.extractEpisodeNumber(title || '') || 1;
      dlResult = await downloader.downloadAndSave(torrent_url, anime, epNum, settings);
    }

    const anySuccess = dlResult.results.some(r => r.success);

    if (anySuccess) {
      if (is_batch) {
        db.addEpisode({ anime_id: anime.id, episode_number: 0, title: title || '', torrent_url, file_size: size || '', is_batch: true });
        const lastEp = episode_range ? episode_range.end : (anime.total_episodes || 0);
        if (lastEp > anime.last_downloaded_episode) {
          db.updateAnime(anime.id, { last_downloaded_episode: lastEp });
        }
      } else {
        const epNum = matcher.extractEpisodeNumber(title || '') || 1;
        db.addEpisode({ anime_id: anime.id, episode_number: epNum, title: title || '', torrent_url, file_size: size || '' });
        db.updateAnime(anime.id, { last_downloaded_episode: epNum });
      }

      db.addDownloadLog({ anime_id: anime.id, episode_number: is_batch ? 0 : null, status: 'success', message: `Downloaded: ${dlResult.filename}`, torrent_url, file_name: dlResult.filename });
      res.json({ success: true, filename: dlResult.filename });
    } else {
      const errors = dlResult.results.map(r => r.error).filter(Boolean).join('; ');
      db.addDownloadLog({ anime_id: anime.id, status: 'failed', message: errors, torrent_url, file_name: dlResult.filename });
      res.status(500).json({ error: errors });
    }
  } catch (err) {
    db.addDownloadLog({ anime_id: anime.id, status: 'failed', message: err.message, torrent_url });
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
function startServer(port) {
  const p = port || PORT;
  return new Promise((resolve, reject) => {
    const server = app.listen(p, () => {
      const actualPort = server.address()?.port || p;
      console.log(`[KuroSeed] Server running at http://localhost:${actualPort}`);
      startCron();

      // Auto-pause anime when torrent finishes and all episodes are downloaded
      const torrentEngine = require('./torrent-engine');
      torrentEngine.onComplete((infoHash, meta) => {
        if (!meta || !meta.animeId) return;
        const anime = db.getAnime(meta.animeId);
        if (!anime) return;
        if (anime.status === 'paused') return;
        if (anime.airing_status && anime.airing_status.toLowerCase().includes('finished')
          && anime.total_episodes && anime.last_downloaded_episode >= anime.total_episodes) {
          // Check no other torrents still downloading for this anime
          const still = torrentEngine.getAllTorrents().filter(
            t => t.meta && t.meta.animeId === meta.animeId && t.hash !== infoHash && t.progress < 1
          );
          if (still.length === 0) {
            db.updateAnime(meta.animeId, { status: 'paused' });
            console.log(`[KuroSeed] Auto-paused ${anime.name} — all episodes downloaded`);
          }
        }
      });

      resolve({ server, port: actualPort });
    });
    server.on('error', (err) => reject(err));
  });
}

// Auto-start only when run directly (not required by Electron)
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[KuroSeed] Failed to start server:', err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
