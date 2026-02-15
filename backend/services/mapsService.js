/**
 * Maps Service — Google Places API (New)
 * Finds nearby hospitals with expanding radius search.
 */

const config = require('../config');

const PLACES_BASE_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const MILES_TO_METERS = 1609.34;
const INITIAL_RADIUS_MILES = 10;
const RADIUS_INCREMENT_MILES = 5;
const MAX_RADIUS_MILES = 50;

/**
 * Search for nearby hospitals using Google Places API (New).
 * Expands radius by 5mi increments until at least 1 result is found.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Array<{ name, address, latitude, longitude, distance, travelTime, website, placeId }>>}
 */
async function findNearbyHospitals(latitude, longitude) {
  const apiKey = config.googleMapsApiKey;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not set in environment');
  }

  let radiusMiles = INITIAL_RADIUS_MILES;
  let results = [];

  while (radiusMiles <= MAX_RADIUS_MILES) {
    const radiusMeters = radiusMiles * MILES_TO_METERS;

    const body = {
      includedTypes: ['hospital'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      },
    };

    const response = await fetch(PLACES_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.websiteUri,places.id,places.currentOpeningHours',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Places API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const places = data.places || [];

    if (places.length > 0) {
      // Filter to only currently-open hospitals.
      // If a place has opening hours data and is marked closed, skip it.
      // Places without opening hours data (most ERs) are assumed 24/7.
      const openPlaces = places.filter((place) => {
        const hours = place.currentOpeningHours;
        if (!hours) return true; // no data → assume open (ERs are typically 24/7)
        return hours.openNow !== false;
      });

      results = openPlaces.map((place) => {
        const hospLat = place.location?.latitude;
        const hospLng = place.location?.longitude;
        const dist = haversineDistance(latitude, longitude, hospLat, hospLng);

        return {
          name: place.displayName?.text || 'Unknown Hospital',
          address: place.formattedAddress || '',
          latitude: hospLat,
          longitude: hospLng,
          distance: Math.round(dist * 10) / 10, // miles, 1 decimal
          travelTime: estimateDriveTime(dist),   // minutes
          website: place.websiteUri || null,
          placeId: place.id || null,
        };
      });

      // Sort by distance
      results.sort((a, b) => a.distance - b.distance);
      break;
    }

    // No results — expand radius
    radiusMiles += RADIUS_INCREMENT_MILES;
  }

  return results;
}

/**
 * Haversine distance between two lat/lng points in miles.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Rough drive time estimate: ~2 min per mile (accounts for city driving, lights, etc.)
 */
function estimateDriveTime(distanceMiles) {
  return Math.round(distanceMiles * 2);
}

module.exports = { findNearbyHospitals };
