const { findNearbyHospitals } = require('../services/mapsService');

/**
 * POST /hospitals
 * Body: { latitude: number, longitude: number }
 * Returns: array of nearby hospitals sorted by distance
 */
async function getHospitals(req, res) {
  try {
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        error: '"latitude" and "longitude" are required',
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates. latitude must be -90 to 90, longitude -180 to 180',
      });
    }

    const hospitals = await findNearbyHospitals(lat, lng);

    return res.json({
      status: 'ok',
      data: hospitals,
    });
  } catch (err) {
    console.error('hospitals error:', err);

    if (err.message.includes('GOOGLE_MAPS_API_KEY is not set')) {
      return res.status(503).json({ error: 'Hospital search service not configured' });
    }

    return res.status(500).json({ error: 'Failed to find nearby hospitals' });
  }
}

module.exports = { getHospitals };
