const { XMLParser } = require('fast-xml-parser');
const https = require('https');
const http = require('http');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Strip season-related text from a query string.
 * The Season field handles season filtering, so we remove it from the raw query
 * to avoid confusing Nyaa's search.
 */
function stripSeasonText(query) {
  return query
    .replace(/\b(?:season|s)\s*\d+\b/gi, '')
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Build a Nyaa RSS URL for an anime.
 * @param {Object} anime - Anime record with search_query, fansub_group, quality, season
 * @returns {string} - Full Nyaa RSS URL
 */
function buildNyaaUrl(anime) {
  const parts = [];

  if (anime.fansub_group) {
    parts.push(`[${anime.fansub_group}]`);
  }

  parts.push(anime.search_query);

  if (anime.quality) {
    parts.push(anime.quality);
  }

  const query = parts.join(' ');
  const encoded = encodeURIComponent(query);

  return `https://nyaa.si/?page=rss&q=${encoded}&c=1_2&f=0`;
}

/**
 * Build a search URL for previewing results.
 */
function buildSearchUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://nyaa.si/?page=rss&q=${encoded}&c=1_2&f=0`;
}

/**
 * Fetch and parse an RSS feed URL.
 * @param {string} url - RSS feed URL
 * @returns {Promise<Array>} - Array of parsed items
 */
function fetchRss(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRss(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Nyaa returned status ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = parser.parse(data);
          const channel = parsed?.rss?.channel;
          if (!channel) {
            return resolve([]);
          }

          let items = channel.item;
          if (!items) return resolve([]);
          if (!Array.isArray(items)) items = [items];

          const results = items.map((item) => ({
            title: item.title || '',
            link: item.link || '',
            torrent_url: item.link || '',
            nyaa_id: item.guid?.['#text'] || item.guid || '',
            size: item['nyaa:size'] || '',
            seeders: parseInt(item['nyaa:seeders'] || '0', 10),
            leechers: parseInt(item['nyaa:leechers'] || '0', 10),
            downloads: parseInt(item['nyaa:downloads'] || '0', 10),
            published: item.pubDate || '',
          }));

          resolve(results);
        } catch (err) {
          reject(new Error(`Failed to parse RSS: ${err.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request to Nyaa timed out'));
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Fetch RSS feed for an anime.
 */
async function fetchAnimeRss(anime) {
  const url = buildNyaaUrl(anime);
  return fetchRss(url);
}

/**
 * Search Nyaa with a raw query string.
 */
async function searchNyaa(query) {
  const url = buildSearchUrl(query);
  return fetchRss(url);
}

module.exports = {
  buildNyaaUrl,
  buildSearchUrl,
  fetchRss,
  fetchAnimeRss,
  searchNyaa,
};
