const config = require('../config');

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Default voice - "Rachel" (clear, professional female voice)
// See https://api.elevenlabs.io/v1/voices for all options
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

// Languages supported by our app (for validation elsewhere)
const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'hi', 'ar', 'zh',
  'ja', 'ko', 'nl', 'ru', 'sv', 'tr', 'uk', 'vi', 'id', 'fil',
  'ta', 'te', 'cs', 'da', 'fi', 'el', 'hu', 'no', 'ro', 'sk',
];

// Languages that ElevenLabs multilingual_v2 accepts as language_code parameter.
// For languages NOT in this list, we still use multilingual_v2 but let it auto-detect
// the language from the text/script (works for Telugu, Tamil, etc.)
const ELEVENLABS_LANGUAGE_CODES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'hi', 'ar', 'zh',
  'ja', 'ko', 'nl', 'ru', 'sv', 'tr', 'uk', 'vi', 'id', 'fil',
  'cs', 'da', 'fi', 'el', 'hu', 'no', 'ro', 'sk',
]);

/**
 * Convert text to speech using ElevenLabs API.
 * @param {string} text - The text to convert to speech
 * @param {object} options
 * @param {string} [options.voiceId] - ElevenLabs voice ID (defaults to Rachel)
 * @param {string} [options.languageCode] - Language code for multilingual output (e.g. 'es', 'ar')
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
async function textToSpeech(text, options = {}) {
  const apiKey = config.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in environment');
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const languageCode = options.languageCode || null;
  // Use multilingual v2 for any non-English language
  const isNonEnglish = languageCode && languageCode !== 'en';
  const modelId = isNonEnglish ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1';

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  };

  // Only pass language_code if ElevenLabs explicitly supports it.
  // For unsupported languages (e.g. Telugu, Tamil), the multilingual model
  // will auto-detect the language from the text/script.
  if (isNonEnglish && ELEVENLABS_LANGUAGE_CODES.has(languageCode)) {
    body.language_code = languageCode;
  }

  const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { textToSpeech, SUPPORTED_LANGUAGES };
