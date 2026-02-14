/**
 * Ranking Service
 * Score = (waitTime * alpha) + (travelTime * beta)
 * Lower score = better choice.
 * Severity affects weights: higher severity prioritizes shorter wait times.
 */

// Default weights
const DEFAULT_ALPHA = 1.0; // weight for wait time
const DEFAULT_BETA = 1.5;  // weight for travel time (distance matters more by default)

// Severity multipliers — higher severity shifts weight toward wait time
const SEVERITY_WEIGHTS = {
  1: { alpha: 0.8, beta: 1.5 },  // low severity: travel time matters more
  2: { alpha: 1.2, beta: 1.2 },  // moderate: balanced
  3: { alpha: 2.0, beta: 0.8 },  // severe: minimize wait time above all
};

/**
 * Rank hospitals by weighted score.
 * @param {Array} hospitals - [{ name, distance, travelTime, waitTime, ... }]
 * @param {number} severity - 1 (low), 2 (moderate), 3 (severe)
 * @returns {{ top3: Array }} top 3 hospitals sorted by score (ascending)
 */
function rankHospitals(hospitals, severity = 2) {
  const weights = SEVERITY_WEIGHTS[severity] || { alpha: DEFAULT_ALPHA, beta: DEFAULT_BETA };

  const scored = hospitals.map((h) => {
    const waitTime = h.waitTime || 0;
    const travelTime = h.travelTime || 0;
    const totalTime = waitTime + travelTime;
    const score = (waitTime * weights.alpha) + (travelTime * weights.beta);

    return {
      ...h,
      totalTime,
      score: Math.round(score * 100) / 100,
    };
  });

  scored.sort((a, b) => a.score - b.score);

  return {
    top3: scored.slice(0, 3),
  };
}

module.exports = { rankHospitals };
