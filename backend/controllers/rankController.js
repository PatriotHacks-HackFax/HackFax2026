const { rankHospitals } = require('../services/rankService');

/**
 * POST /rank
 * Body: {
 *   hospitals: [{ name, distance, travelTime, waitTime }, ...],
 *   severity: 1 | 2 | 3
 * }
 * Returns: { top3: [...] }
 */
function rank(req, res) {
  try {
    const { hospitals, severity } = req.body;

    if (!hospitals || !Array.isArray(hospitals) || hospitals.length === 0) {
      return res.status(400).json({
        error: 'Missing or empty "hospitals" array in request body',
      });
    }

    const severityLevel = Number(severity);
    if (!severity || ![1, 2, 3].includes(severityLevel)) {
      return res.status(400).json({
        error: '"severity" must be 1 (low), 2 (moderate), or 3 (severe)',
      });
    }

    // Validate required fields on each hospital
    for (const h of hospitals) {
      if (!h.name || h.travelTime == null || h.waitTime == null) {
        return res.status(400).json({
          error: 'Each hospital must have "name", "travelTime", and "waitTime"',
        });
      }
    }

    const result = rankHospitals(hospitals, severityLevel);

    return res.json({
      status: 'ok',
      data: result,
    });
  } catch (err) {
    console.error('rank error:', err);
    return res.status(500).json({ error: 'Failed to rank hospitals' });
  }
}

module.exports = { rank };
