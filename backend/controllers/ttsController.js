const { textToSpeech, SUPPORTED_LANGUAGES } = require('../services/ttsService');

/**
 * POST /tts
 * Body: { text: "...", languageCode?: "es", voiceId?: "..." }
 * Returns: audio/mpeg binary stream
 */
async function synthesize(req, res) {
  try {
    const { text, languageCode, voiceId } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '"text" is required and must be a non-empty string' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: '"text" must be under 5000 characters' });
    }

    if (languageCode && !SUPPORTED_LANGUAGES.includes(languageCode)) {
      return res.status(400).json({
        error: `Unsupported language code "${languageCode}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      });
    }

    const audioBuffer = await textToSpeech(text, { languageCode, voiceId });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });

    return res.send(audioBuffer);
  } catch (err) {
    console.error('tts error:', err);

    if (err.message.includes('ELEVENLABS_API_KEY is not set')) {
      return res.status(503).json({ error: 'TTS service not configured' });
    }

    return res.status(500).json({ error: 'Failed to generate speech' });
  }
}

module.exports = { synthesize };
