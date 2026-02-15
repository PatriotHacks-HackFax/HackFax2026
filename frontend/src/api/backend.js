/**
 * TriageSense Backend API Client
 * All network logic lives here. Components must import from this module only.
 */

// In dev: use Vite proxy (/api) to avoid CORS. In prod: use env or default.
const BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.REACT_APP_API_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:3000');

async function request(endpoint, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, '')}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };
  let res;
  try {
    res = await fetch(url, config);
  } catch (err) {
    // Dev fallback: if direct URL fails, retry through Vite proxy.
    if (import.meta.env.DEV && BASE_URL !== '/api') {
      const proxyUrl = `/api${endpoint}`;
      res = await fetch(proxyUrl, config);
    } else {
      throw err;
    }
  }
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
  return res.json();
}

/**
 * POST /diagnose
 * @param {{ symptoms: string, languageCode?: string }} body
 * @returns {Promise<{ condition: string, severity: number, reasoning: string, languageCode?: string }>}
 */
export async function diagnose(body) {
  return request('/diagnose', {
    method: 'POST',
    body: JSON.stringify({
      symptoms: body.symptoms,
      languageCode: body.languageCode,
    }),
  });
}

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

/**
 * POST /hospitals
 * @param {{ latitude: number, longitude: number }} body
 * @returns {Promise<Array<{ name: string, distance: number, travelTime: number }>>}
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
 * Backend expects hospitals array with { name, distance?, travelTime? }.
 * Returns { data: hospitalsWithWait }.
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
 * Backend expects { hospitals: [{ name, travelTime, waitTime }], severity: 1|2|3 }.
 * Returns { data: { top3 } }.
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

/**
 * POST /tts (ElevenLabs text-to-speech)
 * Returns audio/mpeg binary. Use for playback.
 * @param {{ text: string, languageCode?: string, voiceId?: string }} body
 * @returns {Promise<Blob>}
 */
export async function synthesizeTts(body) {
  const url = `${BASE_URL.replace(/\/$/, '')}/tts`;
  const config = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: body.text,
      languageCode: body.languageCode,
      voiceId: body.voiceId,
    }),
  };
  let res;
  try {
    res = await fetch(url, config);
  } catch (err) {
    if (import.meta.env.DEV && BASE_URL !== '/api') {
      res = await fetch('/api/tts', config);
    } else {
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error(res.status === 503 ? 'TTS service not configured' : 'Failed to generate speech');
    err.status = res.status;
    throw err;
  }
  return res.blob();
}
