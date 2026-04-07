/**
 * Episode matching logic for anime torrent titles.
 * Handles formats: "- 09", "- 09v2", "E09", "EP09", "S01E09", " 09 "
 */

const EPISODE_PATTERNS = [
  // "- 09" or "- 09v2" (most common for fansub releases)
  /(?:^|[\s\])])[-–]\s*(\d{1,4})(?:v\d+)?(?:\s|$|\[|\()/,
  // "S01E09" or "S1E09"
  /S\d{1,2}E(\d{1,4})(?:v\d+)?/i,
  // "E09" or "EP09" standalone
  /(?:^|[\s\[\(])(?:EP?)(\d{1,4})(?:v\d+)?(?:\s|$|\]|\))/i,
  // " 09 " surrounded by spaces (last resort, only match 2+ digit numbers to reduce false positives)
  /(?:^|[\s\[\(])(\d{2,4})(?:v\d+)?(?:\s|$|\]|\))/,
];

/**
 * Extract episode number from a torrent title.
 * @param {string} title - The torrent title
 * @returns {number|null} - Episode number or null if not found
 */
function extractEpisodeNumber(title) {
  for (const pattern of EPISODE_PATTERNS) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      // Sanity check: episode numbers are rarely above 2000
      if (num > 0 && num < 2000) {
        return num;
      }
    }
  }
  return null;
}

/**
 * Check if a torrent title matches the quality preference.
 * @param {string} title - The torrent title
 * @param {string} quality - Quality string like "1080p"
 * @returns {boolean}
 */
function matchesQuality(title, quality) {
  if (!quality) return true;
  return title.toLowerCase().includes(quality.toLowerCase());
}

/**
 * Check if a torrent title matches the fansub group.
 * @param {string} title - The torrent title
 * @param {string} fansubGroup - Fansub group name like "Erai-raws"
 * @returns {boolean}
 */
function matchesFansub(title, fansubGroup) {
  if (!fansubGroup) return true;
  return title.toLowerCase().includes(fansubGroup.toLowerCase());
}

const ORDINALS = { '1st': 1, '2nd': 2, '3rd': 3 };
for (let i = 4; i <= 20; i++) ORDINALS[`${i}th`] = i;

/**
 * Extract the season number embedded in a torrent title.
 * Detects patterns like "2nd Season", "Season 2", "S2", "S02", "Part 2", "3rd Season", etc.
 * Returns null if no season indicator is found (assumed season 1).
 */
function extractTitleSeason(title) {
  const t = title.toLowerCase();

  // "2nd Season", "3rd Season", etc.
  const ordMatch = t.match(/(\d{1,2})(?:st|nd|rd|th)\s*season/);
  if (ordMatch) return parseInt(ordMatch[1], 10);

  // "Season 2", "Season 02"
  const sMatch = t.match(/season\s*(\d{1,2})/);
  if (sMatch) return parseInt(sMatch[1], 10);

  // "S2" or "S02" but NOT inside S01E09 pattern
  const sCodeMatch = t.match(/(?:^|[\s\[\]])s(\d{1,2})(?:\s|$|[\[\])]|-)/);
  if (sCodeMatch) return parseInt(sCodeMatch[1], 10);

  // "Part 2" (some anime use this for seasons)
  const partMatch = t.match(/part\s*(\d{1,2})/);
  if (partMatch) return parseInt(partMatch[1], 10);

  return null;
}

/**
 * Check if a torrent title's season matches the anime's configured season.
 * Only rejects when the title has an EXPLICIT different season number.
 * If the title has no season indicator (e.g. uses arc name like "Shimetsu Kaiyuu"),
 * it is allowed through — the search query itself is what narrows the results.
 * @param {string} title - Torrent title
 * @param {number} season - Expected season number
 * @returns {boolean}
 */
function matchesSeason(title, season) {
  const titleSeason = extractTitleSeason(title);

  // No season indicator in title → allow it (could be arc-named season)
  if (titleSeason === null) {
    return true;
  }

  // Explicit season found → must match
  return titleSeason === season;
}

/**
 * Check if a torrent title matches the anime's search query.
 * Strips the fansub group and compares the core title.
 * e.g. search_query "...Ken 2" must appear in the torrent title,
 * so "...Ken - 02" (S1) gets rejected.
 */
function matchesSearchQuery(title, searchQuery) {
  if (!searchQuery) return true;

  // Strip fansub tags from both to compare just the anime name
  const cleanTitle = title.replace(/\[[^\]]*\]/g, '').toLowerCase();
  const cleanQuery = searchQuery.replace(/\[[^\]]*\]/g, '').toLowerCase().trim();

  // Split query into words — keep numbers regardless of length (they distinguish seasons)
  const words = cleanQuery.split(/[\s:,\-]+/).filter(w => w.length >= 2 || /\d/.test(w));
  if (words.length === 0) return true;

  // Check that the anime name portion of the title contains the query
  // Strip fansub and everything after episode number for comparison
  const titleName = cleanTitle
    .replace(/\s*-\s*\d{1,4}(?:v\d+)?\s.*$/, '')  // cut at "- 02 ..."
    .trim();

  // ALL words from the search query must appear in the title's name portion
  return words.every(w => titleName.includes(w));
}

/**
 * Extract the "base name" from a torrent title — the part between [fansub] and the episode number.
 * e.g. "[Erai-raws] Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen - 12 [1080p]" → "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen"
 *      "[Erai-raws] Jujutsu Kaisen - 24 [1080p]" → "Jujutsu Kaisen"
 */
function extractBaseName(title) {
  // Remove leading [fansub group]
  let t = title.replace(/^\[[^\]]*\]\s*/, '');
  // Remove trailing tags like [1080p][...] and episode indicators
  // Cut at " - DD" (episode pattern) keeping the name before it
  const epCut = t.match(/^(.+?)\s*-\s*\d{1,4}(?:v\d+)?\s/);
  if (epCut) return epCut[1].trim();
  // Fallback: cut at first [
  const bracketCut = t.indexOf('[');
  if (bracketCut > 0) return t.substring(0, bracketCut).trim();
  return t.trim();
}

/**
 * Filter and match RSS items for new episodes of an anime.
 * @param {Array} items - RSS feed items
 * @param {Object} anime - Anime record from DB
 * @param {Function} hasEpisodeFn - Function to check if episode exists in DB
 * @returns {Array} - Matched items with episode numbers
 */
function findNewEpisodes(items, anime, hasEpisodeFn) {
  const candidates = [];

  for (const item of items) {
    const title = item.title || '';

    if (!matchesFansub(title, anime.fansub_group)) continue;
    if (!matchesQuality(title, anime.quality)) continue;
    if (!matchesSeason(title, anime.season)) continue;
    if (!matchesSearchQuery(title, anime.search_query)) continue;

    const episodeNum = extractEpisodeNumber(title);
    if (episodeNum === null) continue;
    if (episodeNum <= anime.last_downloaded_episode) continue;
    if (hasEpisodeFn(anime.id, episodeNum)) continue;

    candidates.push({
      ...item,
      episode_number: episodeNum,
      _baseName: extractBaseName(title),
    });
  }

  // When season > 1, if we have a mix of titles with and without subtitles/arc names,
  // keep only the longer base names (the ones with arc/subtitle = the actual new season).
  // e.g. "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen" vs "Jujutsu Kaisen"
  let filtered = candidates;
  if (anime.season > 1 && candidates.length > 0) {
    const baseNames = [...new Set(candidates.map((c) => c._baseName))];
    if (baseNames.length > 1) {
      // Find the longest base name — that's the one with the arc/season subtitle
      const longest = baseNames.reduce((a, b) => (a.length >= b.length ? a : b));
      filtered = candidates.filter((c) => c._baseName === longest);
    }
  }

  // Deduplicate by episode number, keeping highest seeders
  const results = [];
  for (const item of filtered) {
    const existing = results.find((r) => r.episode_number === item.episode_number);
    if (existing) {
      if ((item.seeders || 0) > (existing.seeders || 0)) {
        results[results.indexOf(existing)] = item;
      }
    } else {
      results.push(item);
    }
  }

  // Sort by episode number ascending
  results.sort((a, b) => a.episode_number - b.episode_number);
  return results;
}

// ── Batch release detection ──────────────────────────────

const BATCH_KEYWORDS = /\b(?:batch|complete|bdremux|bdrip|blu-?ray|bd)\b/i;
const EPISODE_RANGE = /(?:[\[\(]\s*)?(\d{1,4})\s*[-–~]\s*(\d{1,4})(?:\s*[\]\)])?/;

/**
 * Extract an episode range from a batch title.
 * e.g. "[01-25]" → { start: 1, end: 25 }, "01~13" → { start: 1, end: 13 }
 * Returns null if no range found.
 */
function extractEpisodeRange(title) {
  // Remove fansub group tags before searching for range
  const cleaned = title.replace(/^\[[^\]]*\]\s*/, '');
  const match = cleaned.match(EPISODE_RANGE);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    if (start < end && start > 0 && end < 2000) {
      return { start, end };
    }
  }
  return null;
}

/**
 * Check if a torrent title looks like a batch/complete release.
 * A batch has no individual episode number but has batch keywords or an episode range.
 */
function isBatchRelease(title) {
  // If it has an individual episode number, it's not a batch
  if (extractEpisodeNumber(title) !== null) return false;

  // Has batch keywords (BD, BDRip, BluRay, Batch, Complete)
  if (BATCH_KEYWORDS.test(title)) return true;

  // Has an episode range like [01-25]
  if (extractEpisodeRange(title) !== null) return true;

  return false;
}

/**
 * Find batch/complete releases from RSS items when no individual episodes exist.
 * Returns the best batch candidates sorted by seeders.
 */
function findBatchReleases(items, anime) {
  const candidates = [];

  for (const item of items) {
    const title = item.title || '';

    if (!matchesFansub(title, anime.fansub_group)) continue;
    if (!matchesQuality(title, anime.quality)) continue;
    if (!matchesSeason(title, anime.season)) continue;
    if (!matchesSearchQuery(title, anime.search_query)) continue;
    if (!isBatchRelease(title)) continue;

    const range = extractEpisodeRange(title);

    candidates.push({
      ...item,
      is_batch: true,
      episode_range: range,
    });
  }

  // Sort by seeders descending (best source first)
  candidates.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  return candidates;
}

module.exports = {
  extractEpisodeNumber,
  extractTitleSeason,
  matchesQuality,
  matchesFansub,
  matchesSeason,
  matchesSearchQuery,
  findNewEpisodes,
  isBatchRelease,
  extractEpisodeRange,
  findBatchReleases,
};
