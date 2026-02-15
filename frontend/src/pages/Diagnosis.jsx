import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as api from '../api/backend';
import HospitalMap from '../components/HospitalMap';
import styles from './Diagnosis.module.css';

const LANGUAGE_LOCALES = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  pl: 'pl-PL',
  hi: 'hi-IN',
  ar: 'ar-SA',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  nl: 'nl-NL',
  ru: 'ru-RU',
  sv: 'sv-SE',
  tr: 'tr-TR',
  uk: 'uk-UA',
  vi: 'vi-VN',
  id: 'id-ID',
  fil: 'fil-PH',
  ta: 'ta-IN',
  te: 'te-IN',
  cs: 'cs-CZ',
  da: 'da-DK',
  fi: 'fi-FI',
  el: 'el-GR',
  hu: 'hu-HU',
  no: 'nb-NO',
  ro: 'ro-RO',
  sk: 'sk-SK',
};

const LANGUAGE_LABELS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  hi: 'Hindi',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  ru: 'Russian',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  id: 'Indonesian',
  fil: 'Filipino',
  ta: 'Tamil',
  te: 'Telugu',
  cs: 'Czech',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  hu: 'Hungarian',
  no: 'Norwegian',
  ro: 'Romanian',
  sk: 'Slovak',
};

// Backend uses severity 1–3: 1=mild, 2=moderate, 3=severe
function getSeverityInfo(severity) {
  if (severity == null) return { label: 'Moderate concern', class: styles.severityMid };
  if (severity <= 1) return { label: 'Low concern', class: styles.severityLow };
  if (severity <= 2) return { label: 'Moderate concern', class: styles.severityMid };
  return { label: 'High concern', class: styles.severityHigh };
}

/** Use browser speech synthesis as fallback when ElevenLabs isn't configured */
function speakWithBrowser(text) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = resolve;
    utterance.onerror = reject;
    window.speechSynthesis.speak(utterance);
  });
}

function getRideLinks(hospital, pickupLocation) {
  if (!hospital || hospital.latitude == null || hospital.longitude == null) return null;

  const lat = Number(hospital.latitude);
  const lng = Number(hospital.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const pickupLat = pickupLocation ? Number(pickupLocation.latitude) : null;
  const pickupLng = pickupLocation ? Number(pickupLocation.longitude) : null;
  const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);

  const destinationName = encodeURIComponent(hospital.name || 'Hospital');

  return {
    // Uber deep link supports explicit pickup+dropoff coordinates.
    // If pickup isn't provided, Uber will typically use the rider's current location.
    uber: `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${destinationName}`
      + (hasPickup ? `&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}` : ''),

    // Lyft usually defaults pickup to current location in-app. Destination can be prefilled reliably.
    // Some clients may honor pickup coords; if ignored, the link still works.
    lyft: `https://ride.lyft.com/?destination[latitude]=${lat}&destination[longitude]=${lng}`
      + (hasPickup ? `&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}` : ''),
  };
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

  const [ttsState, setTtsState] = useState('idle'); // idle | loading | playing | paused
  const [ttsError, setTtsError] = useState(null);
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current._blobUrl) URL.revokeObjectURL(audioRef.current._blobUrl);
        audioRef.current = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

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

  // Limit to 5 closest hospitals
  const closestHospitals = hospitals.slice(0, 5);

  // Find the best hospital (top ranked or closest)
  const bestHospitalName = top3.length > 0 ? top3[0].name : (closestHospitals[0]?.name ?? null);

  const hasMapData = latitude != null && longitude != null;
  const pickupLocation = hasMapData ? { latitude, longitude } : null;
  const languageCode = diagnosis?.languageCode || 'en';
  const languageLocale = LANGUAGE_LOCALES[languageCode] || 'en-US';
  const languageLabel = LANGUAGE_LABELS[languageCode] || languageCode;

  function stopTts() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (audioRef.current._blobUrl) URL.revokeObjectURL(audioRef.current._blobUrl);
      audioRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setTtsState('idle');
  }

  async function handleTts() {
    // If playing → pause
    if (ttsState === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
        setTtsState('paused');
      } else if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
        setTtsState('paused');
      }
      return;
    }

    // If paused → resume
    if (ttsState === 'paused') {
      if (audioRef.current) {
        await audioRef.current.play();
        setTtsState('playing');
      } else if (window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
        setTtsState('playing');
      }
      return;
    }

    // Start fresh
    setTtsError(null);
    setTtsState('loading');
    const nextStepsPart = diagnosis.nextSteps ? ` Next steps: ${diagnosis.nextSteps}` : '';
    const text = `${diagnosis.condition}. ${diagnosis.reasoning}${nextStepsPart}`;

    try {
      const blob = await api.synthesizeTts({ text, languageCode });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio._blobUrl = blobUrl;
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        audioRef.current = null;
        setTtsState('idle');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        audioRef.current = null;
        setTtsState('idle');
        setTtsError('Audio playback failed.');
      };

      await audio.play();
      setTtsState('playing');
    } catch {
      // Fall back to browser speech synthesis
      audioRef.current = null;
      try {
        if (!window.speechSynthesis) throw new Error('Not supported');
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = languageLocale;
        const voices = window.speechSynthesis.getVoices?.() || [];
        const matchingVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith(languageCode));
        if (matchingVoice) utterance.voice = matchingVoice;
        utterance.rate = 0.95;
        utteranceRef.current = utterance;
        utterance.onend = () => { utteranceRef.current = null; setTtsState('idle'); };
        utterance.onerror = () => { utteranceRef.current = null; setTtsState('idle'); };
        window.speechSynthesis.speak(utterance);
        setTtsState('playing');
      } catch {
        setTtsState('idle');
        setTtsError('Audio playback is not available.');
      }
    }
  }

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('/')}
        aria-label="Back to start"
      >
        &larr; Start over
      </button>

      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          Your results. <span className={styles.highlight}>Here&apos;s what we found.</span>
        </h1>
        <p className={styles.pageSubtitle}>
          Based on your symptoms and location.
        </p>
        <p className={styles.disclaimerTop}>
          Not medical professionals. This is not medical advice, and is meant to help you take faster next steps.
          If this is an emergency, call 911.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="condition-heading">
        <h2 id="condition-heading" className={styles.cardTitle}>
          Possible condition
        </h2>
        <p className={styles.pageSubtitle}>Response language: {languageLabel}</p>
        <h3 className={styles.condition}>{diagnosis.condition}</h3>
        <p className={styles.reasoning}>{diagnosis.reasoning}</p>
        <div className={styles.ttsControls}>
          <button
            type="button"
            className={`${styles.ttsButton} ${ttsState === 'playing' ? styles.ttsPlaying : ''} ${ttsState === 'paused' ? styles.ttsPaused : ''}`}
            onClick={handleTts}
            disabled={ttsState === 'loading'}
          >
            {ttsState === 'loading' && (
              <><span className={styles.ttsIcon}>{'...'}</span> Loading</>
            )}
            {ttsState === 'playing' && (
              <><span className={styles.ttsIcon}>{'\u23F8\uFE0E'}</span> Pause</>
            )}
            {ttsState === 'paused' && (
              <><span className={styles.ttsIcon}>{'\u25B6\uFE0E'}</span> Resume</>
            )}
            {ttsState === 'idle' && (
              <><span className={styles.ttsIcon}>{'\u25B6\uFE0E'}</span> Listen</>
            )}
          </button>
          {(ttsState === 'playing' || ttsState === 'paused') && (
            <button
              type="button"
              className={styles.ttsStopButton}
              onClick={stopTts}
            >
              <span className={styles.ttsIcon}>{'\u25A0'}</span> Stop
            </button>
          )}
        </div>
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
        {diagnosis.severity >= 3 && (
          <p className={styles.emergencyNote}>
            If this is a life-threatening emergency, please call <strong>911</strong> immediately.
          </p>
        )}
      </section>

      {diagnosis.emergencyNotified && (
        <section className={styles.alertCard} aria-labelledby="alert-heading">
          <h2 id="alert-heading" className={styles.cardTitle}>
            Emergency contact notified
          </h2>
          <p className={styles.alertText}>
            We sent an email to your emergency contact with a summary of this assessment. They have been asked to check on you.
          </p>
        </section>
      )}

      {diagnosis.nextSteps && (
        <section className={styles.card} aria-labelledby="nextsteps-heading">
          <h2 id="nextsteps-heading" className={styles.cardTitle}>
            What to do next
          </h2>
          <p className={styles.nextSteps}>{diagnosis.nextSteps}</p>
        </section>
      )}

      {/* Best hospital - highlighted */}
      {bestHospitalName && closestHospitals.length > 0 && (
        <section className={styles.bestCard} aria-labelledby="best-heading">
          <h2 id="best-heading" className={styles.cardTitle}>
            Best option for you
          </h2>
          {(() => {
            const best = closestHospitals.find(h => h.name === bestHospitalName) || closestHospitals[0];
            const bestRideLinks = getRideLinks(best, pickupLocation);
            return (
              <div className={styles.bestHospital}>
                <span className={styles.bestBadge}>Top pick</span>
                <span className={styles.bestName}>{best.name}</span>
                <div className={styles.bestStats}>
                  {best.distance != null && (
                    <span className={styles.bestStat}>
                      <strong>{best.distance.toFixed(1)}</strong> mi away
                    </span>
                  )}
                  {best.travelTime != null && (
                    <span className={styles.bestStat}>
                      <strong>{best.travelTime}</strong> min drive
                    </span>
                  )}
                  {best.waitTime != null && (
                    <span className={styles.bestStat}>
                      <strong>{best.waitTime}</strong> min wait
                      {best.waitTimeEstimated === false && <span className={styles.liveBadge}>LIVE</span>}
                    </span>
                  )}
                </div>
                {best.address && (
                  <span className={styles.bestAddress}>{best.address}</span>
                )}
                {bestRideLinks && (
                  <div className={styles.rideLinks}>
                    <a
                      href={bestRideLinks.uber}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.rideButton} ${styles.uberButton}`}
                    >
                      Ride with Uber
                    </a>
                    <a
                      href={bestRideLinks.lyft}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.rideButton} ${styles.lyftButton}`}
                    >
                      Ride with Lyft
                    </a>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      <section className={styles.card} aria-labelledby="hospitals-heading">
        <h2 id="hospitals-heading" className={styles.cardTitle}>
          Nearby hospitals
        </h2>
        {closestHospitals.length === 0 ? (
          <p className={styles.empty}>No nearby hospitals found.</p>
        ) : (
          <ul className={styles.hospitalList}>
            {closestHospitals.map((h, i) => (
              (() => {
                const rideLinks = getRideLinks(h, pickupLocation);
                return (
              <li
                key={i}
                className={`${styles.hospitalCard} ${h.name === bestHospitalName ? styles.hospitalBest : ''}`}
              >
                <span className={styles.hospitalName}>
                  {h.name}
                  {h.name === bestHospitalName && <span className={styles.recommendedTag}>Recommended</span>}
                </span>
                <div className={styles.hospitalStats}>
                  {h.distance != null && (
                    <span className={styles.hospitalStat}>{h.distance.toFixed(1)} mi</span>
                  )}
                  {h.travelTime != null && (
                    <span className={styles.hospitalStat}>{h.travelTime} min drive</span>
                  )}
                  {h.waitTime != null && (
                    <span className={styles.hospitalStat}>
                      {h.waitTime} min wait
                      {h.waitTimeEstimated === false && <span className={styles.liveBadge}>LIVE</span>}
                    </span>
                  )}
                </div>
                {h.latitude && h.longitude && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.directionsLink}
                  >
                    Get directions &rarr;
                  </a>
                )}
                {rideLinks && (
                  <div className={styles.rideLinks}>
                    <a
                      href={rideLinks.uber}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.rideButton} ${styles.uberButton}`}
                    >
                      Uber
                    </a>
                    <a
                      href={rideLinks.lyft}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.rideButton} ${styles.lyftButton}`}
                    >
                      Lyft
                    </a>
                  </div>
                )}
              </li>
                );
              })()
            ))}
          </ul>
        )}
      </section>

      {hasMapData && (
        <section className={styles.card} aria-labelledby="map-heading">
          <h2 id="map-heading" className={styles.cardTitle}>
            Hospitals near you
          </h2>
          <div className={styles.mapContainer}>
            <HospitalMap
              latitude={latitude}
              longitude={longitude}
              hospitals={closestHospitals}
              bestHospitalName={bestHospitalName}
            />
          </div>
          <div className={styles.mapLegendInfo}>
            <span className={styles.legendItem}><span className={styles.legendDotBlue} /> You</span>
            <span className={styles.legendItem}><span className={styles.legendDotGreen} /> Recommended</span>
            <span className={styles.legendItem}><span className={styles.legendDotRed} /> Hospital</span>
          </div>
        </section>
      )}

      <p className={styles.disclaimer}>
        This is not medical advice. Information provided is for general guidance only based on user-described symptoms. Wait times are estimates and may change. In an emergency, call 911.
      </p>
    </div>
  );
}
