const { getWaitTimes } = require('../services/waittimeService');

/**
 * POST /waittimes
 * Body: { hospitals: [{ name, distance, travelTime }, ...] }
 * Returns: hospitals array enriched with waitTime per hospital
 */
function getHospitalWaitTimes(req, res) {
  try {
    const { hospitals } = req.body;

    if (!hospitals || !Array.isArray(hospitals) || hospitals.length === 0) {
      return res.status(400).json({
        error: 'Missing or empty "hospitals" array in request body',
      });
    }

    // Validate each hospital has a name
    for (const h of hospitals) {
      if (!h.name) {
        return res.status(400).json({
          error: 'Each hospital must have a "name" field',
        });
      }
    }

    const hospitalsWithWait = getWaitTimes(hospitals);

    return res.json({
      status: 'ok',
      data: hospitalsWithWait,
    });
  } catch (err) {
    console.error('waittimes error:', err);
    return res.status(500).json({ error: 'Failed to fetch wait times' });
  }
}

module.exports = { getHospitalWaitTimes };
