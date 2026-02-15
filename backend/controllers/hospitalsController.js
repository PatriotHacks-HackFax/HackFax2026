const Hospital = require('../models/Hospital');

const DEFAULT_HOSPITALS = [
  { name: 'City General Hospital', address: '100 Main St', location: { type: 'Point', coordinates: [-122.4194, 37.7749] }, averageWaitMinutes: 32 },
  { name: 'Riverside Medical Center', address: '250 River Ave', location: { type: 'Point', coordinates: [-122.4064, 37.7858] }, averageWaitMinutes: 24 },
  { name: 'St. Mary Emergency Care', address: '80 Pine St', location: { type: 'Point', coordinates: [-122.4313, 37.7694] }, averageWaitMinutes: 41 },
  { name: 'Bayview Health Campus', address: '900 Bayview Rd', location: { type: 'Point', coordinates: [-122.3921, 37.7596] }, averageWaitMinutes: 28 },
  { name: 'Northside Trauma Hospital', address: '10 North Blvd', location: { type: 'Point', coordinates: [-122.4466, 37.7897] }, averageWaitMinutes: 36 },
];

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function ensureSeedHospitals() {
  const count = await Hospital.estimatedDocumentCount();
  if (count > 0) return;
  await Hospital.insertMany(DEFAULT_HOSPITALS);
}

async function nearby(req, res) {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: 'latitude and longitude are required numbers' });
    }

    await ensureSeedHospitals();
    const hospitals = await Hospital.find().lean();

    const ranked = hospitals
      .map((h) => {
        const [lng, lat] = h.location.coordinates;
        const distance = haversineMiles(latitude, longitude, lat, lng);
        const travelTime = Math.max(4, Math.round(distance * 3.2));
        return {
          id: String(h._id),
          name: h.name,
          address: h.address,
          distance,
          travelTime,
          averageWaitMinutes: h.averageWaitMinutes,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    return res.json({ status: 'ok', data: ranked });
  } catch (err) {
    console.error('hospitals error:', err);
    return res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
}

module.exports = { nearby };
