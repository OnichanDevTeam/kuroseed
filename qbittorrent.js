const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

let sessionCookie = null;

/**
 * Make an HTTP request to qBittorrent Web API.
 */
function qbRequest(baseUrl, endpoint, { method = 'GET', formData, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqHeaders = { ...headers };
    if (sessionCookie) reqHeaders['Cookie'] = sessionCookie;

    let body = null;
    if (formData) {
      const boundary = '----AniWatch' + Date.now();
      reqHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const parts = [];
      for (const [key, val] of Object.entries(formData)) {
        if (val && val._isFile) {
          parts.push(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: application/x-bittorrent\r\n\r\n`
          );
          parts.push(val.data);
          parts.push('\r\n');
        } else {
          parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
        }
      }
      parts.push(`--${boundary}--\r\n`);
      body = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));
      reqHeaders['Content-Length'] = body.length;
    }

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders,
      timeout: 10000,
      rejectUnauthorized: false,
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        // Capture session cookie
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          for (const c of setCookie) {
            if (c.startsWith('SID=')) {
              sessionCookie = c.split(';')[0];
            }
          }
        }
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('qBittorrent request timed out')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Login to qBittorrent Web API.
 */
async function login(baseUrl, username, password) {
  sessionCookie = null;
  const url = new URL('/api/v2/auth/login', baseUrl);
  const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          for (const c of setCookie) {
            if (c.startsWith('SID=')) sessionCookie = c.split(';')[0];
          }
        }
        if (data.trim() === 'Ok.' && sessionCookie) {
          resolve(true);
        } else {
          reject(new Error('qBittorrent login failed: ' + data.trim()));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('qBittorrent login timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Add a torrent to qBittorrent from a .torrent file on disk.
 */
async function addTorrentFile(baseUrl, torrentFilePath, savePath) {
  const fileData = fs.readFileSync(torrentFilePath);
  const filename = path.basename(torrentFilePath);

  const formData = {
    torrents: { _isFile: true, filename, data: fileData },
  };

  if (savePath) {
    formData.savepath = savePath;
  }

  const res = await qbRequest(baseUrl, '/api/v2/torrents/add', {
    method: 'POST',
    formData,
  });

  if (res.status === 200 && res.data.trim() === 'Ok.') {
    return { success: true };
  }

  // Maybe session expired, try re-login
  if (res.status === 403) {
    throw new Error('qBittorrent session expired — re-login needed');
  }

  throw new Error(`qBittorrent add torrent failed (${res.status}): ${res.data}`);
}

/**
 * Add a torrent to qBittorrent by URL.
 */
async function addTorrentUrl(baseUrl, torrentUrl, savePath) {
  const formData = {
    urls: torrentUrl,
  };

  if (savePath) {
    formData.savepath = savePath;
  }

  const res = await qbRequest(baseUrl, '/api/v2/torrents/add', {
    method: 'POST',
    formData,
  });

  if (res.status === 200 && res.data.trim() === 'Ok.') {
    return { success: true };
  }

  if (res.status === 403) {
    throw new Error('qBittorrent session expired — re-login needed');
  }

  throw new Error(`qBittorrent add torrent failed (${res.status}): ${res.data}`);
}

/**
 * Get list of all torrents with their status/progress.
 */
async function getTorrents(baseUrl, filter) {
  const params = filter ? `?filter=${filter}` : '';
  const res = await qbRequest(baseUrl, '/api/v2/torrents/info' + params);

  if (res.status === 403) throw new Error('Session expired');
  if (res.status !== 200) throw new Error(`Failed to get torrents (${res.status})`);

  try {
    return JSON.parse(res.data);
  } catch {
    return [];
  }
}

/**
 * Get global transfer info (speeds, etc.)
 */
async function getTransferInfo(baseUrl) {
  const res = await qbRequest(baseUrl, '/api/v2/transfer/info');
  if (res.status !== 200) return {};
  try { return JSON.parse(res.data); } catch { return {}; }
}

/**
 * Test connection to qBittorrent.
 */
async function testConnection(baseUrl, username, password) {
  await login(baseUrl, username, password);
  const res = await qbRequest(baseUrl, '/api/v2/app/version');
  return { connected: true, version: res.data.trim() };
}

module.exports = {
  login,
  addTorrentFile,
  addTorrentUrl,
  getTorrents,
  getTransferInfo,
  testConnection,
};
