import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/backend';
import styles from './Symptoms.module.css';

function parseHospitals(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data) && raw.data.length > 0 && typeof raw.data[0] === 'object') return raw.data;
  if (Array.isArray(raw?.hospitals)) return raw.hospitals;
  return [];
}

function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export default function Symptoms() {
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = symptoms.trim();
    if (!trimmed) {
      setError('Please describe how you are feeling. Type your symptoms in the box above.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const diagnosisRaw = await api.diagnose({ symptoms: trimmed });
      const diagnosis =
        diagnosisRaw?.condition != null
          ? diagnosisRaw
          : { condition: 'Unknown', severity: 1, reasoning: 'Diagnosis pending.' };
      // Backend uses severity 1–3 (mild/moderate/severe). Ensure valid value.
      const severity = Math.min(3, Math.max(1, Number(diagnosis.severity) || 1));

      let latitude = null;
      let longitude = null;
      let hospitals = [];
      try {
        const coords = await getGeolocation();
        latitude = coords.latitude;
        longitude = coords.longitude;
        const hospitalsRaw = await api.getHospitals({ latitude, longitude });
        hospitals = parseHospitals(hospitalsRaw);
      } catch (geoErr) {
        // Location failed (timeout, denied, unavailable) — continue without hospitals
      }

      let hospitalsWithWait = hospitals;
      if (hospitals.length > 0) {
        const waitRes = await api.getWaitTimes({ hospitals });
        hospitalsWithWait = Array.isArray(waitRes?.data) ? waitRes.data : hospitals;
      }

      let rankResult = { top3: [] };
      if (hospitalsWithWait.length > 0) {
        const rankRaw = await api.rank({ hospitals: hospitalsWithWait, severity });
        rankResult = rankRaw?.data ?? rankRaw ?? { top3: [] };
      }

      navigate('/diagnosis', {
        state: {
          diagnosis: { ...diagnosis, severity },
          hospitals: hospitalsWithWait,
          rankResult,
          latitude,
          longitude,
        },
      });
    } catch (err) {
      const body = err?.body;
      const msg = body?.message ?? body?.error ?? err?.message;
      if (body?.error === 'unsafe_input') {
        setError('Please describe your symptoms in a different way. If you need immediate help, call 911.');
      } else if (body?.error === 'llm_failure' || err?.status === 503) {
        setError(msg || 'The diagnosis service is temporarily unavailable. Please try again in a few moments.');
      } else if (err?.message === 'Failed to fetch') {
        setError('We couldn\'t connect to the backend. Make sure the backend is running (cd backend && npm start).');
      } else if (err?.status === 500) {
        setError(msg || 'The server encountered an error. Check that GEMINI_API_KEY is set in backend/.env and the backend terminal for details.');
      } else if (msg?.toLowerCase().includes('timeout') || err?.code === 3) {
        setError('Location request timed out. Please allow location access and try again, or check your connection.');
      } else {
        setError(msg || 'We couldn\'t complete this step. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Describe your symptoms.
          <br />
          <span className={styles.heroHighlight}>Find care quickly.</span>
        </h1>
        <p className={styles.heroSubtitle}>
          We&apos;ll help you find nearby hospitals based on your symptoms and location.
        </p>
      </header>

      <div className={styles.formAndFeatures}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label htmlFor="symptoms">How are you feeling?</label>
        <p className={styles.helper}>Example: &quot;I have chest pain and shortness of breath when I walk.&quot;</p>
        <textarea
          id="symptoms"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder="Type your symptoms here. For example: headache, dizziness, pain in my arm..."
          rows={6}
          disabled={loading}
          autoFocus
          aria-describedby={error ? 'symptoms-error' : undefined}
        />

        {error && (
          <p id="symptoms-error" className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? 'Finding care options...' : 'Find care'}
        </button>
      </form>

      <section className={styles.features}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Quick triage</h3>
          <p className={styles.featureDesc}>Get a preliminary assessment in seconds.</p>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Nearby care</h3>
          <p className={styles.featureDesc}>We find hospitals close to you.</p>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3 className={styles.featureTitle}>Clear results</h3>
          <p className={styles.featureDesc}>Ranked by total time: drive + wait.</p>
        </div>
      </section>
      </div>
    </div>
  );
}
