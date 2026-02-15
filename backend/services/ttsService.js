const config = require('../config');

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Default voice - "Rachel" (clear, professional female voice)
// See https://api.elevenlabs.io/v1/voices for all options
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

// Supported language codes for multilingual output
const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'hi', 'ar', 'zh',
  'ja', 'ko', 'nl', 'ru', 'sv', 'tr', 'uk', 'vi', 'id', 'fil',
  'ta', 'te', 'cs', 'da', 'fi', 'el', 'hu', 'no', 'ro', 'sk',
];

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
  // Use multilingual v2 model for language support, standard v1 for English-only
  const languageCode = options.languageCode || null;
  const modelId = languageCode && languageCode !== 'en'
    ? 'eleven_multilingual_v2'
    : 'eleven_monolingual_v1';

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  };

  // Add language code for multilingual model
  if (languageCode && languageCode !== 'en') {
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
