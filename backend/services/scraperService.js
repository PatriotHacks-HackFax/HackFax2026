/**
 * Scraper Service — Fetches real ER wait times from hospital websites.
 *
 * Strategy:
 * 1. Check if hospital belongs to a known system (Inova, etc.) with embedded wait-time data
 * 2. If not, try fetching the hospital's own website and look for wait-time patterns
 * 3. Fall back to null (caller uses synthetic data)
 */

// Known hospital systems with central wait-time pages
const KNOWN_SYSTEMS = [
  {
    pattern: /inova/i,
    url: 'https://www.inova.org/emergency-room-wait-times',
    parser: parseInovaPage,
  },
];

// Cache scraped data for 5 minutes to avoid hammering hospital sites
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Try to scrape real wait time for a hospital.
 * @param {string} hospitalName
 * @param {string|null} website - Hospital's website URL from Places API
 * @returns {Promise<number|null>} Wait time in minutes, or null if not found
 */
async function scrapeWaitTime(hospitalName, website) {
  // 1. Check known systems
  for (const system of KNOWN_SYSTEMS) {
    if (system.pattern.test(hospitalName)) {
      try {
        const waitTimes = await fetchWithCache(system.url, system.parser);
        const match = fuzzyMatch(hospitalName, waitTimes);
        if (match != null) return match;
      } catch (err) {
        console.error(`Scrape error for ${system.url}:`, err.message);
      }
    }
  }

  // 2. Try hospital's own website for wait-time patterns
  if (website) {
    try {
      const waitTime = await scrapeGenericSite(website);
      if (waitTime != null) return waitTime;
    } catch (err) {
      console.error(`Scrape error for ${website}:`, err.message);
    }
  }

  // 3. No data found
  return null;
}

/**
 * Fetch a URL and parse it, with caching.
 */
async function fetchWithCache(url, parserFn) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TriageSense/1.0 (hackathon project)',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const data = parserFn(html);

  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

/**
 * Parse Inova's wait times page.
 * Inova embeds all wait time data in drupalSettings.waitTimes as structured JSON
 * inside a <script type="application/json" data-drupal-selector="drupal-settings-json"> tag.
 * Each entry has: location.name, waitTime (in minutes).
 * Returns Map<normalizedName, waitTimeMinutes>
 */
function parseInovaPage(html) {
  const waitTimes = new Map();

  // Extract drupalSettings JSON from the page
  const settingsMatch = html.match(
    /data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/
  );

  if (!settingsMatch) return waitTimes;

  try {
    const settings = JSON.parse(settingsMatch[1]);
    const waitTimesData = settings.waitTimes;

    if (!waitTimesData) return waitTimes;

    // waitTimesData is keyed by paragraph ID, each value is an array of locations
    for (const paragraphId of Object.keys(waitTimesData)) {
      const locations = waitTimesData[paragraphId];
      if (!Array.isArray(locations)) continue;

      for (const entry of locations) {
        const name = entry.location?.name;
        const wt = entry.waitTime;

        if (name && wt != null && wt !== '') {
          const minutes = parseInt(wt, 10);
          if (!isNaN(minutes) && minutes >= 0) {
            waitTimes.set(normalizeName(name), minutes);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse Inova drupalSettings:', err.message);
  }

  return waitTimes;
}

/**
 * Try to scrape wait times from a generic hospital website.
 */
async function scrapeGenericSite(url) {
  const waitPaths = [
    '/emergency-room-wait-times',
    '/er-wait-times',
    '/wait-times',
    '/emergency',
  ];

  let baseUrl;
  try {
    baseUrl = new URL(url).origin;
  } catch {
    return null;
  }

  for (const path of waitPaths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'User-Agent': 'TriageSense/1.0 (hackathon project)' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      const minutes = extractWaitFromHtml(html);
      if (minutes != null) return minutes;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Extract a wait time from generic HTML content.
 */
function extractWaitFromHtml(html) {
  const patterns = [
    /wait\s*(?:time)?[:\s]*(\d{1,3})\s*min/i,
    /(\d{1,3})\s*min(?:ute)?s?\s*(?:wait|estimated)/i,
    /estimated[:\s]*(\d{1,3})\s*min/i,
  ];

  for (const pat of patterns) {
    const match = html.match(pat);
    if (match) {
      const mins = parseInt(match[1], 10);
      if (mins >= 0 && mins < 500) return mins;
    }
  }

  return null;
}

/**
 * Fuzzy match a hospital name against scraped data.
 */
function fuzzyMatch(hospitalName, waitTimesMap) {
  const normalized = normalizeName(hospitalName);

  // Exact match
  if (waitTimesMap.has(normalized)) {
    return waitTimesMap.get(normalized);
  }

  // Partial match — find best overlap
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, minutes] of waitTimesMap) {
    const score = overlapScore(normalized, key);
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = minutes;
    }
  }

  return bestMatch;
}

/**
 * Normalize a hospital name for comparison.
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate word overlap score between two strings (0-1).
 */
function overlapScore(a, b) {
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}

module.exports = { scrapeWaitTime };
