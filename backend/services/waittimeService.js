/**
 * Wait-Time Service
 * Tries to scrape real ER wait times first, falls back to synthetic data.
 */

const { scrapeWaitTime } = require('./scraperService');

// Synthetic wait-time ranges (minutes)
const WAIT_RANGES = { default: { min: 15, max: 90 } };

/**
 * Generate a synthetic wait time for a hospital.
 * Seeded by hospital name + current hour for consistency.
 */
function generateSyntheticWait(hospitalName) {
  const hour = new Date().getHours();
  let seed = 0;
  for (let i = 0; i < hospitalName.length; i++) {
    seed += hospitalName.charCodeAt(i);
  }
  seed += hour;

  const rand = ((seed * 9301 + 49297) % 233280) / 233280;
  const range = WAIT_RANGES.default;
  return Math.round(range.min + rand * (range.max - range.min));
}

/**
 * Get wait times for a list of hospitals.
 * Scrapes real data when possible, falls back to synthetic.
 * @param {Array} hospitals - [{ name, website?, ... }]
 * @returns {Promise<Array>} hospitals enriched with waitTime + waitTimeEstimated flag
 */
async function getWaitTimes(hospitals) {
  const results = await Promise.all(
    hospitals.map(async (hospital) => {
      let waitTime = null;
      let estimated = true;

      try {
        waitTime = await scrapeWaitTime(hospital.name, hospital.website || null);
      } catch (err) {
        // Scrape failed — will use synthetic
      }

      if (waitTime != null) {
        estimated = false; // Real data from hospital website
      } else {
        waitTime = generateSyntheticWait(hospital.name);
      }

      return {
        ...hospital,
        waitTime,
        waitTimeEstimated: estimated,
      };
    })
  );

  return results;
}

module.exports = { getWaitTimes, generateSyntheticWait };
