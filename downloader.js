const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const qbt = require('./qbittorrent');

/**
 * Download a .torrent file from a URL and save it to disk.
 */
function downloadTorrent(url, savePath) {
  let torrentUrl = url;
  if (url.includes('nyaa.si/view/')) {
    torrentUrl = url.replace('/view/', '/download/') + '.torrent';
  }

  return new Promise((resolve, reject) => {
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const doRequest = (reqUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));

      const c = reqUrl.startsWith('https') ? https : http;
      const req = c.get(reqUrl, { timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location, redirects + 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }

        const file = fs.createWriteStream(savePath);
        let size = 0;

        res.on('data', (chunk) => { size += chunk.length; file.write(chunk); });
        res.on('end', () => { file.end(); resolve({ success: true, filePath: savePath, fileSize: size }); });
        res.on('error', (err) => { file.end(); fs.unlink(savePath, () => {}); reject(err); });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
      req.on('error', reject);
    };

    doRequest(torrentUrl);
  });
}

/**
 * Build a clean .torrent filename.
 */
function buildTorrentFilename(animeName, season, episodeNumber, fansubGroup) {
  const safeName = safeFolderName(animeName);
  const ep = String(episodeNumber).padStart(2, '0');
  const safeGroup = fansubGroup.replace(/[^a-zA-Z0-9\-_]/g, '_');
  return `${safeName}_S${season}_E${ep}_${safeGroup}.torrent`;
}

/**
 * Make a string safe for use as a folder/file name.
 */
function safeFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')   // remove illegal chars
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
    || 'Unknown';
}

/**
 * Extract the base series name from a full anime title.
 * "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen" → "Jujutsu Kaisen"
 * "My Hero Academia Season 7" → "My Hero Academia"
 * "Mob Psycho 100 III" → "Mob Psycho 100"
 */
function extractSeriesName(fullTitle) {
  let name = fullTitle;

  // Cut at first colon (arc/subtitle separator)
  const colonIdx = name.indexOf(':');
  if (colonIdx > 3) name = name.substring(0, colonIdx);

  // Remove season indicators
  name = name
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, '')
    .replace(/\bseason\s*\d+\b/gi, '')
    .replace(/\bpart\s*\d+\b/gi, '')
    .replace(/\b[SsPp]\d+\b/g, '')
    .replace(/\b(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return name || fullTitle;
}

/**
 * Build the organized folder structure for an anime.
 *
 * baseFolder/
 * └── Jujutsu Kaisen/                    ← series folder
 *     └── Shimetsu Kaiyuu - Zenpen/      ← season/arc folder
 *         ├── [video files go here]
 *         └── .torrents/
 *             └── *.torrent
 */
function buildAnimePaths(baseFolder, anime) {
  const seriesName = safeFolderName(extractSeriesName(anime.name));
  const fullTitle = safeFolderName(anime.name);

  // Build a clean season/arc subfolder name
  let seasonFolder;
  if (seriesName.toLowerCase() === fullTitle.toLowerCase()) {
    // No subtitle/arc — use "Season X"
    seasonFolder = `Season ${anime.season}`;
  } else {
    // Extract just the differentiating part (arc name, "2nd Season", etc.)
    let subtitle = anime.name;

    // Try splitting on colon first: "JJK: Shimetsu Kaiyuu" → "Shimetsu Kaiyuu"
    const colonIdx = subtitle.indexOf(':');
    if (colonIdx > 3) {
      subtitle = subtitle.substring(colonIdx + 1).trim().replace(/^[-–]\s*/, '').trim();
    } else {
      // Remove the series name prefix: "My Hero Academia Season 7" → "Season 7"
      const re = new RegExp('^' + seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
      subtitle = subtitle.replace(re, '').trim();
    }

    seasonFolder = safeFolderName(subtitle) || `Season ${anime.season}`;
  }

  // Detect if baseFolder already ends with the series name to avoid duplication
  // e.g. user selected "/Anime/Jujutsu Kaisen" → don't create "/Anime/Jujutsu Kaisen/Jujutsu Kaisen/"
  const baseName = path.basename(baseFolder).toLowerCase();
  const seriesLower = seriesName.toLowerCase();
  const alreadyHasSeriesDir = baseName === seriesLower
    || baseName.startsWith(seriesLower)
    || seriesLower.startsWith(baseName);

  const seriesDir = alreadyHasSeriesDir ? baseFolder : path.join(baseFolder, seriesName);
  const seasonDir = path.join(seriesDir, seasonFolder);
  const videoDir = seasonDir;
  const torrentDir = path.join(seasonDir, '.torrents');

  return { seriesDir, seasonDir, videoDir, torrentDir };
}

/**
 * Ensure all directories in the anime path structure exist.
 */
function ensurePaths(paths) {
  for (const dir of [paths.videoDir, paths.torrentDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download .torrent, save organized, and start downloading the actual video.
 * Priority: 1) Built-in WebTorrent  2) qBittorrent API  3) Watch folder
 */
async function downloadAndSave(url, anime, episodeNumber, settings) {
  const filename = buildTorrentFilename(anime.name, anime.season, episodeNumber, anime.fansub_group);
  const results = [];
  const watchFolder = settings.qbittorrent_watch_folder;
  const qbtUrl = settings.qbittorrent_url;
  const qbtUser = settings.qbittorrent_username;
  const qbtPass = settings.qbittorrent_password;
  const engine = settings.download_engine || 'builtin'; // 'builtin', 'qbittorrent', 'watchfolder'

  // Build organized folder structure
  const baseFolder = anime.download_folder || settings.default_download_folder || path.join(__dirname, 'downloads');
  const paths = buildAnimePaths(baseFolder, anime);
  ensurePaths(paths);

  // Step 1: Download .torrent file to .torrents subfolder
  const torrentPath = path.join(paths.torrentDir, filename);
  let torrentDownloaded = false;

  try {
    await downloadTorrent(url, torrentPath);
    torrentDownloaded = true;
    results.push({ target: 'torrent_file', success: true, filePath: torrentPath });
  } catch (err) {
    results.push({ target: 'torrent_file', success: false, error: err.message });
  }

  if (!torrentDownloaded) return { filename, results };

  // Step 2: Start actual video download
  let downloaded = false;

  // Try built-in WebTorrent engine first (unless qBittorrent is explicitly configured)
  if (engine === 'builtin' || (!qbtUrl && !watchFolder)) {
    try {
      const torrentEngine = require('./torrent-engine');
      await torrentEngine.addTorrent(torrentPath, paths.videoDir, {
        animeId: anime.id,
        episodeNumber: episodeNumber,
        animeName: anime.name,
      });
      results.push({ target: 'builtin', success: true, message: `Downloading to ${paths.videoDir}` });
      console.log(`[KuroSeed] WebTorrent downloading: ${filename} → ${paths.videoDir}`);
      downloaded = true;
    } catch (err) {
      results.push({ target: 'builtin', success: false, error: err.message });
      console.error(`[KuroSeed] WebTorrent error: ${err.message}`);
    }
  }

  // Fallback to qBittorrent if configured and built-in failed or not selected
  if (!downloaded && qbtUrl && engine !== 'builtin') {
    try {
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || 'adminadmin');
      await qbt.addTorrentFile(qbtUrl, torrentPath, paths.videoDir);
      results.push({ target: 'qbittorrent', success: true, message: `Sent to qBittorrent → ${paths.videoDir}` });
      console.log(`[KuroSeed] Sent to qBittorrent: ${filename} → ${paths.videoDir}`);
      downloaded = true;
    } catch (err) {
      results.push({ target: 'qbittorrent', success: false, error: err.message });
      console.error(`[KuroSeed] qBittorrent error: ${err.message}`);
    }
  }

  // Fallback to watch folder
  if (!downloaded && watchFolder) {
    try {
      const watchPath = path.join(watchFolder, filename);
      if (!fs.existsSync(watchFolder)) fs.mkdirSync(watchFolder, { recursive: true });
      fs.copyFileSync(torrentPath, watchPath);
      results.push({ target: 'watch_folder', success: true, filePath: watchPath });
      downloaded = true;
    } catch (err) {
      results.push({ target: 'watch_folder', success: false, error: err.message });
    }
  }

  return { filename, results };
}

/**
 * Build a .torrent filename for a batch release.
 */
function buildBatchTorrentFilename(animeName, season, fansubGroup, range) {
  const safeName = safeFolderName(animeName);
  const safeGroup = fansubGroup ? fansubGroup.replace(/[^a-zA-Z0-9\-_]/g, '_') : 'Unknown';
  const rangePart = range ? `_${String(range.start).padStart(2, '0')}-${String(range.end).padStart(2, '0')}` : '';
  return `${safeName}_S${season}_Batch${rangePart}_${safeGroup}.torrent`;
}

/**
 * Download and save a batch torrent release.
 * Same logic as downloadAndSave but adapted for batch naming.
 */
async function downloadAndSaveBatch(url, anime, range, settings) {
  const filename = buildBatchTorrentFilename(anime.name, anime.season, anime.fansub_group, range);
  const results = [];
  const engine = settings.download_engine || 'builtin';
  const qbtUrl = settings.qbittorrent_url;
  const qbtUser = settings.qbittorrent_username;
  const qbtPass = settings.qbittorrent_password;
  const watchFolder = settings.qbittorrent_watch_folder;

  const baseFolder = anime.download_folder || settings.default_download_folder || path.join(__dirname, 'downloads');
  const paths = buildAnimePaths(baseFolder, anime);
  ensurePaths(paths);

  const torrentPath = path.join(paths.torrentDir, filename);
  let torrentDownloaded = false;

  try {
    await downloadTorrent(url, torrentPath);
    torrentDownloaded = true;
    results.push({ target: 'torrent_file', success: true, filePath: torrentPath });
  } catch (err) {
    results.push({ target: 'torrent_file', success: false, error: err.message });
  }

  if (!torrentDownloaded) return { filename, results };

  let downloaded = false;

  if (engine === 'builtin' || (!qbtUrl && !watchFolder)) {
    try {
      const torrentEngine = require('./torrent-engine');
      await torrentEngine.addTorrent(torrentPath, paths.videoDir, {
        animeId: anime.id,
        animeName: anime.name,
        isBatch: true,
      });
      results.push({ target: 'builtin', success: true, message: `Downloading batch to ${paths.videoDir}` });
      console.log(`[KuroSeed] WebTorrent downloading batch: ${filename} → ${paths.videoDir}`);
      downloaded = true;
    } catch (err) {
      results.push({ target: 'builtin', success: false, error: err.message });
      console.error(`[KuroSeed] WebTorrent batch error: ${err.message}`);
    }
  }

  if (!downloaded && qbtUrl && engine !== 'builtin') {
    try {
      await qbt.login(qbtUrl, qbtUser || 'admin', qbtPass || 'adminadmin');
      await qbt.addTorrentFile(qbtUrl, torrentPath, paths.videoDir);
      results.push({ target: 'qbittorrent', success: true, message: `Batch sent to qBittorrent → ${paths.videoDir}` });
      downloaded = true;
    } catch (err) {
      results.push({ target: 'qbittorrent', success: false, error: err.message });
    }
  }

  if (!downloaded && watchFolder) {
    try {
      const watchPath = path.join(watchFolder, filename);
      if (!fs.existsSync(watchFolder)) fs.mkdirSync(watchFolder, { recursive: true });
      fs.copyFileSync(torrentPath, watchPath);
      results.push({ target: 'watch_folder', success: true, filePath: watchPath });
      downloaded = true;
    } catch (err) {
      results.push({ target: 'watch_folder', success: false, error: err.message });
    }
  }

  return { filename, results };
}

module.exports = {
  downloadTorrent,
  buildTorrentFilename,
  buildBatchTorrentFilename,
  buildAnimePaths,
  extractSeriesName,
  downloadAndSave,
  downloadAndSaveBatch,
};
