import { useState, useRef, useEffect } from 'react';
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

async function continueFromDiagnosis(diagnosis, severity, navigate) {
  let latitude = null;
  let longitude = null;
  let hospitals = [];
  try {
    const coords = await getGeolocation();
    latitude = coords.latitude;
    longitude = coords.longitude;
    const hospitalsRaw = await api.getHospitals({ latitude, longitude });
    hospitals = parseHospitals(hospitalsRaw);
  } catch {
    // Location failed — continue without hospitals
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
}

function handleApiError(err, setError) {
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
  } else if (err?.status === 413 || msg?.toLowerCase().includes('entity too large')) {
    setError('The photo is too large. Try removing the photo and using a smaller image, or describe your symptoms in text.');
  } else {
    setError(msg || 'We couldn\'t complete this step. Please try again.');
  }
}

export default function Symptoms() {
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const uploadInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = symptoms.trim();
    const hasText = trimmed.length > 0;
    const hasPhoto = photoFile != null;

    if (!hasText && !hasPhoto) {
      setError('Please describe your symptoms in the box above, add a photo, or both.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const diagnosisRaw = await api.diagnose({
        symptoms: trimmed,
        imageFile: photoFile || undefined,
      });
      const diagnosis = diagnosisRaw?.condition != null ? diagnosisRaw : { condition: 'Unknown', severity: 1, reasoning: 'Diagnosis pending.' };
      const severity = Math.min(3, Math.max(1, Number(diagnosis.severity) || 1));
      await continueFromDiagnosis(diagnosis, severity, navigate);
    } catch (err) {
      if (err?.message === 'Please describe your symptoms or add a photo.') {
        setError('Please describe your symptoms in the box above, add a photo, or both.');
      } else {
        handleApiError(err, setError);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
    setError(null);
  }

  function handleRemovePhoto() {
    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview(null);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }

  async function handleOpenCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported in this browser. Try uploading a photo instead.');
      return;
    }
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setShowCamera(true);
      setError(null);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('Permission') || msg.includes('denied') || err?.name === 'NotAllowedError') {
        setCameraError('Camera access was denied. Please allow camera access in your browser settings.');
      } else if (msg.includes('NotFound') || err?.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError('Could not access camera. Try uploading a photo instead.');
      }
    }
  }

  function handleCloseCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  }

  function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState !== 4) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(blob));
        setError(null);
        handleCloseCamera();
      },
      'image/jpeg',
      0.9
    );
  }

  useEffect(() => {
    if (!showCamera || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
  }, [showCamera]);

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
          rows={5}
          disabled={loading}
          autoFocus
          aria-describedby={error ? 'symptoms-error' : undefined}
        />

        <p className={styles.photoLabel}>Add a photo (optional)</p>
        <p className={styles.photoHint}>Take a clear photo of the affected area or upload one from your device.</p>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelect}
          className={styles.fileInput}
          aria-label="Upload photo from device"
        />

        {cameraError && (
          <p className={styles.cameraError} role="alert">
            {cameraError}
          </p>
        )}

        {!photoPreview ? (
          <div className={styles.photoOptions}>
            <button
              type="button"
              className={styles.addPhotoButton}
              onClick={handleOpenCamera}
              disabled={loading}
            >
              📷 Take photo
            </button>
            <button
              type="button"
              className={styles.uploadPhotoButton}
              onClick={() => uploadInputRef.current?.click()}
              disabled={loading}
            >
              📁 Upload photo
            </button>
          </div>
        ) : (
          <div className={styles.photoSection}>
            <div className={styles.photoPreview}>
              <img src={photoPreview} alt="Your photo" />
            </div>
            <button
              type="button"
              className={styles.removePhotoButton}
              onClick={handleRemovePhoto}
              disabled={loading}
            >
              Remove Photo
            </button>
          </div>
        )}

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

      {showCamera && (
        <div className={styles.cameraOverlay} role="dialog" aria-label="Camera">
          <div className={styles.cameraContent}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.cameraVideo}
            />
            <div className={styles.cameraActions}>
              <button
                type="button"
                className={styles.cameraCancelButton}
                onClick={handleCloseCamera}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.cameraCaptureButton}
                onClick={handleCapturePhoto}
              >
                📷 Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
