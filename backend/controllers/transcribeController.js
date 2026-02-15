const llmService = require('../services/llmService');

function validateAudio(audioData, audioMimeType) {
  if (!audioData || !audioMimeType) {
    return { error: 'audioData and audioMimeType are required' };
  }
  if (typeof audioData !== 'string' || typeof audioMimeType !== 'string') {
    return { error: 'audioData and audioMimeType must be strings' };
  }
  const rawMimeType = audioMimeType.trim().toLowerCase();
  const mimeType = rawMimeType.split(';')[0].trim();
  if (!/^audio\/[a-z0-9.+-]+$/.test(mimeType)) {
    return { error: 'audioMimeType must be a valid audio MIME type' };
  }
  const data = audioData.trim();
  if (!data) {
    return { error: 'audioData must be non-empty' };
  }
  return { audio: { data, mimeType } };
}

async function transcribeAudio(req, res) {
  const { audioData, audioMimeType } = req.body || {};
  const validation = validateAudio(audioData, audioMimeType);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const result = await llmService.transcribeSymptomsFromAudio({ audio: validation.audio });
    return res.json({
      symptomsText: result.symptomsText,
      languageCode: result.languageCode,
    });
  } catch (err) {
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : 503;
    return res.status(status).json({
      error: 'transcription_failure',
      message: err?.publicMessage || 'Transcription service temporarily unavailable',
    });
  }
}

module.exports = { transcribeAudio };
