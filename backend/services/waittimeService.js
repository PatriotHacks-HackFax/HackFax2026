/**
 * Wait-Time Service
 * Currently uses synthetic data. Can be swapped to Gemini-powered scraping later.
 */

// Synthetic wait-time ranges by hospital type (minutes)
const WAIT_RANGES = {
  emergency_room: { min: 30, max: 180 },
  urgent_care: { min: 10, max: 60 },
  hospital: { min: 20, max: 120 },
  default: { min: 15, max: 90 },
};

/**
 * Generate a synthetic wait time for a hospital.
 * Uses seeded randomness based on hospital name + current hour so the same
 * hospital returns a consistent wait time within the same hour window.
 */
function generateSyntheticWait(hospitalName) {
  const hour = new Date().getHours();
  let seed = 0;
  for (let i = 0; i < hospitalName.length; i++) {
    seed += hospitalName.charCodeAt(i);
  }
  seed += hour;

  // Simple pseudo-random from seed
  const rand = ((seed * 9301 + 49297) % 233280) / 233280;

  const range = WAIT_RANGES.default;
  const waitTime = Math.round(range.min + rand * (range.max - range.min));
  return waitTime;
}

/**
 * Get wait times for a list of hospitals.
 * @param {Array} hospitals - Array of hospital objects (must have at least `name`)
 * @returns {Array} hospitals enriched with `waitTime` (minutes) and `waitTimeEstimated` flag
 */
function getWaitTimes(hospitals) {
  return hospitals.map((hospital) => ({
    ...hospital,
    waitTime: generateSyntheticWait(hospital.name),
    waitTimeEstimated: true, // flag so frontend knows this is an estimate
  }));
}

module.exports = { getWaitTimes, generateSyntheticWait };
