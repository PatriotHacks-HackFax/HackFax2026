import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as api from '../api/backend';
import styles from './Diagnosis.module.css';

// Backend uses severity 1–3: 1=mild, 2=moderate, 3=severe
function getSeverityInfo(severity) {
  if (severity == null) return { label: 'Moderate concern', class: styles.severityMid };
  if (severity <= 1) return { label: 'Low concern', class: styles.severityLow };
  if (severity <= 2) return { label: 'Moderate concern', class: styles.severityMid };
  return { label: 'High concern', class: styles.severityHigh };
}

export default function Diagnosis() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;

  useEffect(() => {
    if (!state?.diagnosis) {
      navigate('/', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.diagnosis) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  const { diagnosis, hospitals = [], rankResult, latitude, longitude } = state;
  const top3 = rankResult?.top3 ?? rankResult?.data?.top3 ?? [];
  const severityInfo = getSeverityInfo(diagnosis.severity);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState(null);

  const mapUrl =
    latitude != null && longitude != null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.02},${latitude - 0.02},${longitude + 0.02},${latitude + 0.02}&layer=mapnik`
      : null;

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('/')}
        aria-label="Back to start"
      >
        ← Start over
      </button>

      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          Your results. <span className={styles.highlight}>Here&apos;s what we found.</span>
        </h1>
        <p className={styles.pageSubtitle}>
          Based on your symptoms and location.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="condition-heading">
        <h2 id="condition-heading" className={styles.cardTitle}>
          Possible condition
        </h2>
        <h3 className={styles.condition}>{diagnosis.condition}</h3>
        <p className={styles.reasoning}>{diagnosis.reasoning}</p>
        <button
          type="button"
          className={styles.ttsButton}
          onClick={async () => {
            setTtsError(null);
            setTtsLoading(true);
            try {
              const text = `${diagnosis.condition}. ${diagnosis.reasoning}`;
              const blob = await api.synthesizeTts({ text });
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              await audio.play();
              audio.onended = () => URL.revokeObjectURL(url);
            } catch {
              setTtsError('Audio playback is not available.');
            } finally {
              setTtsLoading(false);
            }
          }}
          disabled={ttsLoading}
          aria-label="Listen to results"
        >
          {ttsLoading ? 'Playing...' : '🔊 Listen to results'}
        </button>
        {ttsError && <p className={styles.ttsError}>{ttsError}</p>}
      </section>

      <section className={styles.card} aria-labelledby="severity-heading">
        <h2 id="severity-heading" className={styles.cardTitle}>
          How serious is it?
        </h2>
        <div className={styles.severityRow}>
          <span className={`${styles.severityLabel} ${severityInfo.class}`}>
            {severityInfo.label}
          </span>
          <span className={styles.severityValue}>
            ({diagnosis.severity} of 3)
          </span>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="hospitals-heading">
        <h2 id="hospitals-heading" className={styles.cardTitle}>
          Nearby hospitals
        </h2>
        {hospitals.length === 0 ? (
          <p className={styles.empty}>No nearby hospitals found.</p>
        ) : (
          <ul className={styles.hospitalList}>
            {hospitals.map((h, i) => (
              <li key={i} className={styles.hospitalCard}>
                <span className={styles.hospitalName}>{h.name}</span>
                <span className={styles.hospitalMeta}>
                  {h.distance != null && `${h.distance.toFixed(1)} miles away`}
                  {h.travelTime != null && ` • ${h.travelTime} minutes to drive`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mapUrl && (
        <section className={styles.card} aria-labelledby="map-heading">
          <h2 id="map-heading" className={styles.cardTitle}>
            Map
          </h2>
          <div className={styles.mapContainer}>
            <iframe
              title="Location map"
              src={mapUrl}
              className={styles.map}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      )}

      {top3.length > 0 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => navigate('/ranked', { state: { top3 } })}
          >
            View best hospitals for you
          </button>
        </div>
      )}
    </div>
  );
}
