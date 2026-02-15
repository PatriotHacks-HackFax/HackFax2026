import { useEffect, useRef, useState } from 'react';
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const full = String(reader.result || '');
      const marker = 'base64,';
      const idx = full.indexOf(marker);
      if (idx === -1) {
        reject(new Error('Failed to encode audio'));
        return;
      }
      resolve(full.slice(idx + marker.length));
    };
    reader.onerror = () => reject(new Error('Failed to read audio file'));
    reader.readAsDataURL(blob);
  });
}

function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function inferLanguageFromText(text) {
  const value = String(text || '');
  if (/[\u0C00-\u0C7F]/.test(value)) return 'te';
  if (/[\u0B80-\u0BFF]/.test(value)) return 'ta';
  if (/[\u0900-\u097F]/.test(value)) return 'hi';
  if (/[\u0600-\u06FF]/.test(value)) return 'ar';
  if (/[\u4E00-\u9FFF]/.test(value)) return 'zh';
  if (/[\u3040-\u30FF]/.test(value)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(value)) return 'ko';
  return null;
}

const LANGUAGE_LABELS = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', pl: 'Polish', hi: 'Hindi', ar: 'Arabic', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean', nl: 'Dutch', ru: 'Russian', sv: 'Swedish',
  tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', id: 'Indonesian',
  fil: 'Filipino', ta: 'Tamil', te: 'Telugu', cs: 'Czech', da: 'Danish',
  fi: 'Finnish', el: 'Greek', hu: 'Hungarian', no: 'Norwegian',
  ro: 'Romanian', sk: 'Slovak',
};

function getFriendlyError(err, fallback) {
  const raw = err?.body?.message || err?.body?.error || err?.message || fallback;
  const text = String(raw || '').trim();
  if (/Cannot POST \/transcribe-audio/i.test(text)) {
    return 'Backend route /transcribe-audio is unavailable. Restart backend and frontend dev servers.';
  }
  if (/<!doctype html>|<html/i.test(text)) return fallback;
  return text || fallback;
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
    setError(msg || 'The server encountered an error. Check that GEMINI_API_KEY is set in backend/.env.');
  } else if (msg?.toLowerCase().includes('timeout') || err?.code === 3) {
    setError('Location request timed out. Please allow location access and try again.');
  } else if (err?.status === 413 || msg?.toLowerCase().includes('entity too large')) {
    setError('The photo is too large. Try a smaller image, or describe your symptoms in text.');
  } else {
    setError(msg || 'We couldn\'t complete this step. Please try again.');
  }
}

export default function Symptoms() {
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const waveformDataRef = useRef(null);
  const waveformRafRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const recordingStartRef = useRef(0);
  const waveformCanvasRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const lastTranscribeAtRef = useRef(0);
  const recordedMimeTypeRef = useRef('audio/webm');
  const baseSymptomsRef = useRef('');

  // Photo state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const uploadInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const navigate = useNavigate();

  const mediaRecorderSupported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      clearAudioResources();
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // --- Voice recording ---

  function clearAudioResources() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (waveformRafRef.current) {
      cancelAnimationFrame(waveformRafRef.current);
      waveformRafRef.current = null;
    }
    analyserRef.current = null;
    waveformDataRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function drawWaveform() {
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = waveformDataRef.current;
    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    analyser.getByteTimeDomainData(dataArray);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f766e';
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
    waveformRafRef.current = requestAnimationFrame(drawWaveform);
  }

  async function transcribeCurrentAudio(finalPass = false) {
    if (isTranscribingRef.current || audioChunksRef.current.length === 0) return;

    try {
      isTranscribingRef.current = true;
      if (finalPass) setTranscribing(true);

      const snapshotBlob = new Blob(audioChunksRef.current, { type: recordedMimeTypeRef.current });
      if (!snapshotBlob.size) return;

      const audioData = await blobToBase64(snapshotBlob);
      const transcript = await api.transcribeAudio({
        audioData,
        audioMimeType: recordedMimeTypeRef.current.split(';')[0] || 'audio/webm',
      });

      const nextTranscript = typeof transcript?.symptomsText === 'string' ? transcript.symptomsText.trim() : '';
      if (nextTranscript) {
        const base = baseSymptomsRef.current;
        setSymptoms(base ? `${base} ${nextTranscript}` : nextTranscript);
      }
      const inferredFromText = inferLanguageFromText(nextTranscript);
      const nextLanguage = transcript?.languageCode || inferredFromText || null;
      if (nextLanguage) setDetectedLanguage(nextLanguage);
    } catch (err) {
      if (finalPass) {
        setError(getFriendlyError(err, 'Audio transcription failed. Please try again.'));
      }
    } finally {
      isTranscribingRef.current = false;
      if (finalPass) setTranscribing(false);
    }
  }

  async function startRecording() {
    if (!mediaRecorderSupported || !navigator.mediaDevices?.getUserMedia) {
      setError('Audio recording is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      setError(null);
      baseSymptomsRef.current = symptoms.trim();
      lastTranscribeAtRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;
        waveformDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      recordedMimeTypeRef.current = preferredMime || recorder.mimeType || 'audio/webm';
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearAudioResources();
        if (!audioChunksRef.current.length) {
          setError('No audio was captured. Please try again.');
          return;
        }
        await transcribeCurrentAudio(true);
        audioChunksRef.current = [];
      };

      recorder.onerror = () => {
        setRecording(false);
        clearAudioResources();
        setError('Audio recording failed. Please try again.');
      };

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingSeconds(elapsed);
      }, 200);

      recorder.start(300);
      setRecording(true);
      drawWaveform();
    } catch {
      clearAudioResources();
      setError('Microphone access denied. Please allow microphone permissions and try again.');
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) { stopRecording(); return; }
    startRecording();
  }

  // --- Photo ---

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
    if (photoPreview && photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      cameraStreamRef.current = stream;
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
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  }

  function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || !cameraStreamRef.current || video.readyState !== 4) return;

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
    if (!showCamera || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
  }, [showCamera]);

  // --- Submit ---

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
        languageCode: detectedLanguage || undefined,
      });
      const diagnosis = diagnosisRaw?.condition != null
        ? diagnosisRaw
        : { condition: 'Unknown', severity: 1, reasoning: 'Diagnosis pending.' };
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
          diagnosis: { ...diagnosis, severity, languageCode: diagnosis.languageCode || detectedLanguage || 'en' },
          hospitals: hospitalsWithWait,
          rankResult,
          latitude,
          longitude,
        },
      });
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

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Describe your symptoms.
          <br />
          <span className={styles.heroHighlight}>Find care quickly.</span>
        </h1>
        <p className={styles.heroSubtitle}>
          We will help you find nearby hospitals based on your symptoms and location.
        </p>
        <p className={styles.disclaimerNote}>
          Not medical professionals. This tool is not medical advice, and is meant to help you take faster next steps.
          If this is an emergency, call 911.
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
            disabled={loading || transcribing}
            autoFocus
            aria-describedby={error ? 'symptoms-error' : undefined}
          />

          {/* Voice recording panel */}
          <div className={styles.recordingPanel}>
            <div className={styles.recordingHeader}>
              <button
                type="button"
                onClick={toggleRecording}
                className={styles.micButton}
                disabled={loading || transcribing || !mediaRecorderSupported}
                aria-pressed={recording}
                title={mediaRecorderSupported ? 'Record your voice' : 'Audio recording not supported'}
              >
                {recording ? 'Stop recording' : 'Record symptoms'}
              </button>
              <div className={styles.timerWrap}>
                <span className={`${styles.timerDot} ${recording ? styles.timerDotLive : ''}`} />
                <span className={styles.timerText}>{formatDuration(recordingSeconds)}</span>
              </div>
            </div>

            <canvas ref={waveformCanvasRef} className={styles.waveform} aria-label="Live recording waveform" />

            <div className={styles.inputActions}>
              <span className={styles.voiceStatus}>
                {recording && 'Recording... speak naturally, then press stop to transcribe.'}
                {!recording && transcribing && 'Finalizing transcription from your recording...'}
                {!recording && !transcribing && detectedLanguage && `Detected language: ${LANGUAGE_LABELS[detectedLanguage] || detectedLanguage} (${detectedLanguage})`}
                {!recording && !transcribing && !detectedLanguage && 'Use voice recording. We transcribe automatically while you speak.'}
              </span>
            </div>
          </div>

          {/* Photo upload */}
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
            <p className={styles.cameraError} role="alert">{cameraError}</p>
          )}

          {!photoPreview ? (
            <div className={styles.photoOptions}>
              <button type="button" className={styles.addPhotoButton} onClick={handleOpenCamera} disabled={loading}>
                Take photo
              </button>
              <button type="button" className={styles.uploadPhotoButton} onClick={() => uploadInputRef.current?.click()} disabled={loading}>
                Upload photo
              </button>
            </div>
          ) : (
            <div className={styles.photoSection}>
              <div className={styles.photoPreview}>
                <img src={photoPreview} alt="Your photo" />
              </div>
              <button type="button" className={styles.removePhotoButton} onClick={handleRemovePhoto} disabled={loading}>
                Remove Photo
              </button>
            </div>
          )}

          {error && (
            <p id="symptoms-error" className={styles.error} role="alert">{error}</p>
          )}

          <button type="submit" disabled={loading || transcribing || recording} className={styles.submit}>
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
            <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
            <div className={styles.cameraActions}>
              <button type="button" className={styles.cameraCancelButton} onClick={handleCloseCamera}>
                Cancel
              </button>
              <button type="button" className={styles.cameraCaptureButton} onClick={handleCapturePhoto}>
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
