const llmService = require('../services/llmService');
const User = require('../models/User');

const UNSAFE_PATTERNS = [
  /self[- ]?harm/i,
  /suicide/i,
  /kill\s+myself/i,
  /end\s+my\s+life/i,
  /hurt\s+myself/i,
];

function isUnsafeInput(symptoms) {
  const text = symptoms.join(' ').toLowerCase();
  return UNSAFE_PATTERNS.some((re) => re.test(text));
}

function validateSymptoms(symptoms, allowEmpty) {
  if (symptoms === undefined || symptoms === null) {
    if (allowEmpty) {
      return { normalized: [] };
    }
    return { error: 'symptoms required' };
  }

  if (typeof symptoms === 'string') {
    const normalizedText = symptoms.trim();
    if (!normalizedText) {
      if (allowEmpty) {
        return { normalized: [] };
      }
      return { error: 'symptoms must contain at least one non-empty string' };
    }
    return { normalized: [normalizedText] };
  }

  if (!Array.isArray(symptoms)) {
    return { error: 'symptoms must be a string or an array of strings' };
  }
  if (symptoms.length < 1) {
    return { error: 'symptoms must contain at least one item' };
  }
  if (!symptoms.every((s) => typeof s === 'string')) {
    return { error: 'symptoms must contain only strings' };
  }

  const normalized = symptoms.map((s) => s.trim()).filter(Boolean);
  if (normalized.length < 1) {
    if (allowEmpty) {
      return { normalized: [] };
    }
    return { error: 'symptoms must contain at least one non-empty string' };
  }

  return { normalized };
}

function validateOptionalImage(imageData, imageMimeType) {
  const hasImageData = imageData !== undefined && imageData !== null && String(imageData).trim() !== '';
  const hasImageMimeType = imageMimeType !== undefined && imageMimeType !== null && String(imageMimeType).trim() !== '';

  if (!hasImageData && !hasImageMimeType) {
    return { image: null };
  }

  if (!hasImageData || !hasImageMimeType) {
    return { error: 'imageData and imageMimeType are required together' };
  }

  if (typeof imageData !== 'string' || typeof imageMimeType !== 'string') {
    return { error: 'imageData and imageMimeType must be strings' };
  }

  const mimeType = imageMimeType.trim().toLowerCase();
  if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) {
    return { error: 'imageMimeType must be a valid image MIME type' };
  }

  const data = imageData.trim();
  if (!data) {
    return { error: 'imageData must be non-empty' };
  }

  return { image: { data, mimeType } };
}

async function diagnose(req, res) {
  const { symptoms, imageData, imageMimeType } = req.body || {};
  const imageValidation = validateOptionalImage(imageData, imageMimeType);
  if (imageValidation.error) {
    return res.status(400).json({ error: imageValidation.error });
  }
  const validation = validateSymptoms(symptoms, Boolean(imageValidation.image));
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const normalizedSymptoms = validation.normalized;
  const image = imageValidation.image;
  let profile = null;

  if (normalizedSymptoms.length > 0 && isUnsafeInput(normalizedSymptoms)) {
    return res.status(400).json({ error: 'unsafe_input' });
  }

  if (req.user?.id) {
    try {
      const user = await User.findById(req.user.id).lean();
      if (user) {
        profile = {
          age: user.age ?? null,
          gender: user.gender || '',
          heightCm: user.heightCm ?? null,
          weightKg: user.weightKg ?? null,
        };
      }
    } catch (err) {
      console.warn('Unable to load user profile for diagnose:', err?.message || String(err));
    }
  }

  try {
    const result = await llmService.generateDiagnosis({
      symptoms: normalizedSymptoms,
      image,
      profile,
    });
    return res.json({
      condition: result.condition,
      severity: result.severity,
      reasoning: result.reasoning,
    });
  } catch (err) {
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : 503;
    const message = err?.publicMessage || 'Diagnosis service temporarily unavailable';

    console.error('Diagnosis LLM error:', err?.message || String(err));
    return res.status(status).json({
      error: 'llm_failure',
      message,
    });
  }
}

module.exports = { diagnose };
