const path = require('path');
const fs = require('fs');

let client = null;
let WebTorrent = null;

// Track active downloads: torrentId → { animeId, episodeNumber, ... }
const activeDownloads = new Map();
let onDoneCallback = null;

async function loadWebTorrent() {
  if (!WebTorrent) {
    const mod = await import('webtorrent');
    WebTorrent = mod.default || mod;
  }
  return WebTorrent;
}

async function getClient() {
  if (!client) {
    const WT = await loadWebTorrent();
    client = new WT();
    client.on('error', (err) => {
      console.error('[TorrentEngine] Client error:', err.message);
    });
  }
  return client;
}

/**
 * Add a torrent and start downloading.
 * @param {string} torrentFileOrUrl - Path to .torrent file or magnet/URL
 * @param {string} savePath - Directory to save downloaded files
 * @param {object} meta - { animeId, episodeNumber, animeName }
 * @returns {Promise<object>} - { infoHash, name }
 */
async function addTorrent(torrentFileOrUrl, savePath, meta = {}) {
  const c = await getClient();

  return new Promise((resolve, reject) => {
    // Check if already downloading this torrent
    const existing = c.torrents.find(t =>
      t.path === savePath && activeDownloads.has(t.infoHash) &&
      activeDownloads.get(t.infoHash).episodeNumber === meta.episodeNumber
    );
    if (existing) {
      return resolve({ infoHash: existing.infoHash, name: existing.name, alreadyActive: true });
    }

    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const opts = { path: savePath };

    c.add(torrentFileOrUrl, opts, (torrent) => {
      activeDownloads.set(torrent.infoHash, {
        animeId: meta.animeId,
        episodeNumber: meta.episodeNumber,
        animeName: meta.animeName || '',
        addedAt: Date.now(),
      });

      console.log(`[TorrentEngine] Downloading: ${torrent.name} → ${savePath}`);

      torrent.on('done', () => {
        console.log(`[TorrentEngine] Complete: ${torrent.name}`);
        // Notify completion listeners
        if (onDoneCallback) onDoneCallback(torrent.infoHash, meta);
      });

      torrent.on('error', (err) => {
        console.error(`[TorrentEngine] Torrent error: ${torrent.name} — ${err.message}`);
      });

      resolve({ infoHash: torrent.infoHash, name: torrent.name });
    });

    // Timeout after 30s if torrent metadata not received
    setTimeout(() => {
      reject(new Error('Torrent metadata timeout'));
    }, 30000);
  });
}

/**
 * Get status of all active torrents.
 */
function getAllTorrents() {
  if (!client) return [];
  return client.torrents.map((t) => ({
    name: t.name,
    hash: t.infoHash,
    progress: t.progress,
    state: getTorrentState(t),
    size: t.length,
    downloaded: t.downloaded,
    dlspeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    eta: t.downloadSpeed > 0 ? Math.round((t.length - t.downloaded) / t.downloadSpeed) : 8640000,
    save_path: t.path,
    numPeers: t.numPeers,
    added_on: activeDownloads.has(t.infoHash) ? Math.floor(activeDownloads.get(t.infoHash).addedAt / 1000) : 0,
    meta: activeDownloads.get(t.infoHash) || {},
  }));
}

function getTorrentState(t) {
  if (pausedTorrents.has(t.infoHash)) return 'pausedDL';
  if (t.done) return 'stalledUP'; // seeding / complete
  if (t.downloadSpeed > 0) return 'downloading';
  if (t.numPeers > 0) return 'downloading';
  return 'stalledDL';
}

// Track paused torrents
const pausedTorrents = new Set();

/**
 * Pause a torrent by deselecting all files (stops downloading).
 */
function pauseTorrent(infoHash) {
  if (!client) return false;
  const torrent = client.torrents.find(t => t.infoHash === infoHash);
  if (!torrent) return false;
  pausedTorrents.add(infoHash);
  torrent.files.forEach(f => f.deselect());
  // Disconnect all peers to stop transfer immediately
  torrent.wires.forEach(wire => wire.destroy());
  return true;
}

/**
 * Resume a torrent by re-selecting all files.
 */
function resumeTorrent(infoHash) {
  if (!client) return false;
  const torrent = client.torrents.find(t => t.infoHash === infoHash);
  if (!torrent) return false;
  pausedTorrents.delete(infoHash);
  torrent.files.forEach(f => f.select());
  return true;
}

/**
 * Remove a torrent (optionally delete files).
 */
function removeTorrent(infoHash, deleteFiles = false) {
  if (!client) return;
  const torrent = client.torrents.find(t => t.infoHash === infoHash);
  if (torrent) {
    torrent.destroy({ destroyStore: deleteFiles });
    activeDownloads.delete(infoHash);
  }
}

/**
 * Remove completed torrents (stop seeding).
 */
function removeCompleted() {
  if (!client) return 0;
  const completed = client.torrents.filter(t => t.done);
  completed.forEach(t => {
    t.destroy({ destroyStore: false });
    activeDownloads.delete(t.infoHash);
  });
  return completed.length;
}

/**
 * Get total stats.
 */
function getStats() {
  if (!client) return { activeTorrents: 0, downloadSpeed: 0, uploadSpeed: 0 };
  return {
    activeTorrents: client.torrents.length,
    downloadSpeed: client.downloadSpeed,
    uploadSpeed: client.uploadSpeed,
  };
}

/**
 * Destroy the client entirely.
 */
function destroy() {
  if (client) {
    client.destroy();
    client = null;
    activeDownloads.clear();
  }
}

/**
 * Register a callback for when a torrent finishes downloading.
 */
function onComplete(callback) {
  onDoneCallback = callback;
}

module.exports = {
  addTorrent,
  getAllTorrents,
  pauseTorrent,
  resumeTorrent,
  removeTorrent,
  removeCompleted,
  getStats,
  destroy,
  getClient,
  onComplete,
};
