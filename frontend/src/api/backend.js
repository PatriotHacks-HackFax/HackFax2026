/**
 * TriageSense Backend API Client
 * All network logic lives here. Components must import from this module only.
 */

// In dev: use VITE_API_URL (direct) or Vite proxy (/api).
// In prod: use VITE_API_URL env var, or same-origin (empty string) for DO hosting.
const BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.REACT_APP_API_URL ||
  (import.meta.env.DEV ? '/api' : '');

const TOKEN_KEY = 'triage_auth_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, '')}${endpoint}`;
  const token = getAuthToken();
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(url, config);
  if (!res.ok) {
    const err = new Error(`API error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.response = res;
    const text = await res.text();
    try {
      err.body = text ? JSON.parse(text) : {};
    } catch {
      err.body = { error: text || res.statusText };
    }
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return res;
  return res.json();
}

// --- Auth ---

export async function signup(body) {
  const data = await request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name,
      email: body.email,
      password: body.password,
    }),
  });
  if (data?.token) setAuthToken(data.token);
  return data;
}

export async function login(body) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: body.email,
      password: body.password,
    }),
  });
  if (data?.token) setAuthToken(data.token);
  return data;
}

export async function fetchMe() {
  return request('/auth/me', { method: 'GET' });
}

export async function updateProfile(body) {
  return request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({
      name: body.name,
      age: body.age,
      gender: body.gender,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      emergencyContacts: body.emergencyContacts?.map((c) => ({
        name: c.name,
        relation: c.relation,
        phone: c.phone,
        email: c.email || '',
      })),
    }),
  });
}

// --- Diagnose ---

/**
 * POST /diagnose. Accepts text and/or image. At least one required.
 * @param {{ symptoms?: string, imageFile?: File, languageCode?: string }} body
 * @returns {Promise<{ condition: string, severity: number, reasoning: string, languageCode?: string }>}
 */
export async function diagnose(body) {
  const trimmed = (body.symptoms || '').trim();
  const hasText = trimmed.length > 0;
  const hasImage = body.imageFile != null;

  if (!hasText && !hasImage) {
    throw new Error('Please describe your symptoms or add a photo.');
  }

  const payload = {
    symptoms: hasText ? trimmed : 'Photo of affected area',
  };

  if (body.languageCode) {
    payload.languageCode = body.languageCode;
  }

  if (hasImage && body.imageFile) {
    const compressed = await compressImage(body.imageFile);
    payload.imageData = await blobToBase64(compressed);
    payload.imageMimeType = 'image/jpeg';
  }

  return request('/diagnose', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- Image helpers ---

const MAX_IMAGE_DIM = 1200;
const JPEG_QUALITY = 0.8;

function compressImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        if (width > height) {
          height = Math.round((height / width) * MAX_IMAGE_DIM);
          width = MAX_IMAGE_DIM;
        } else {
          width = Math.round((width / height) * MAX_IMAGE_DIM);
          height = MAX_IMAGE_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error('Could not compress image'));
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = typeof result === 'string' && result.startsWith('data:')
        ? result.split(',')[1]
        : result;
      resolve(base64 || '');
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

// --- Transcribe audio ---

/**
 * POST /transcribe-audio
 * @param {{ audioData: string, audioMimeType: string }} body
 * @returns {Promise<{ symptomsText: string, languageCode: string }>}
 */
export async function transcribeAudio(body) {
  return request('/transcribe-audio', {
    method: 'POST',
    body: JSON.stringify({
      audioData: body.audioData,
      audioMimeType: body.audioMimeType,
    }),
  });
}

// --- Hospitals, Wait Times, Ranking ---

/**
 * POST /hospitals
 * @param {{ latitude: number, longitude: number }} body
 */
export async function getHospitals(body) {
  return request('/hospitals', {
    method: 'POST',
    body: JSON.stringify({
      latitude: body.latitude,
      longitude: body.longitude,
    }),
  });
}

/**
 * POST /waittimes
 * @param {{ hospitals: Array<{ name: string, distance?: number, travelTime?: number }> }} body
 */
export async function getWaitTimes(body) {
  return request('/waittimes', {
    method: 'POST',
    body: JSON.stringify({ hospitals: body.hospitals }),
  });
}

/**
 * POST /rank
 * @param {{ hospitals: any[], severity: number }} body
 */
export async function rank(body) {
  return request('/rank', {
    method: 'POST',
    body: JSON.stringify({
      hospitals: body.hospitals,
      severity: body.severity,
    }),
  });
}

// --- TTS ---

/**
 * POST /tts (ElevenLabs text-to-speech)
 * Returns audio/mpeg binary.
 * @param {{ text: string, languageCode?: string, voiceId?: string }} body
 * @returns {Promise<Blob>}
 */
export async function synthesizeTts(body) {
  const url = `${BASE_URL.replace(/\/$/, '')}/tts`;
  const token = getAuthToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      text: body.text,
      languageCode: body.languageCode,
      voiceId: body.voiceId,
    }),
  });
  if (!res.ok) {
    const err = new Error(res.status === 503 ? 'TTS service not configured' : 'Failed to generate speech');
    err.status = res.status;
    throw err;
  }
  return res.blob();
}
