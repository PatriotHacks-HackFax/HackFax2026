import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths (Leaflet + bundlers issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const hospitalIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const bestIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * Interactive Leaflet map showing user location + hospital markers.
 * @param {{ latitude: number, longitude: number, hospitals: Array, bestHospitalName: string|null }} props
 */
export default function HospitalMap({ latitude, longitude, hospitals, bestHospitalName }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || latitude == null || longitude == null) return;

    // Create map if it doesn't exist yet
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    // User marker
    L.marker([latitude, longitude], { icon: userIcon })
      .addTo(map)
      .bindPopup('<strong>Your location</strong>');

    // Hospital markers
    const validHospitals = hospitals.filter(h => h.latitude && h.longitude);
    validHospitals.forEach((h) => {
      const isBest = h.name === bestHospitalName;
      const icon = isBest ? bestIcon : hospitalIcon;
      const waitInfo = h.waitTime != null
        ? `<br/>Wait: ${h.waitTime} min${h.waitTimeEstimated === false ? ' (LIVE)' : ''}`
        : '';
      const popup = `<strong>${h.name}</strong>${isBest ? ' ⭐' : ''}<br/>${h.distance?.toFixed(1)} mi away${waitInfo}`;

      L.marker([h.latitude, h.longitude], { icon })
        .addTo(map)
        .bindPopup(popup);
    });

    // Fit bounds to include all points
    const allPoints = [
      [latitude, longitude],
      ...validHospitals.map(h => [h.latitude, h.longitude]),
    ];
    if (allPoints.length > 1) {
      map.fitBounds(allPoints, { padding: [30, 30] });
    } else {
      map.setView([latitude, longitude], 13);
    }
  }, [latitude, longitude, hospitals, bestHospitalName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    />
  );
}
