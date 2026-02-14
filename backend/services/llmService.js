const { GoogleGenerativeAI } = require('@google/generative-ai');

let model = null;
let modelName = null;

function getCandidateModels() {
  const configured = process.env.GEMINI_MODEL || process.env.GEMINI_MODELS;
  if (configured && configured.trim()) {
    return configured.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
}

function getImageCandidateModels() {
  const configured = process.env.GEMINI_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODELS;
  if (configured && configured.trim()) {
    return configured.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return ['gemini-2.5-flash', 'gemini-2.5-flash-image', 'gemini-2.0-flash'];
}

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is required. Set it in .env');
    err.statusCode = 500;
    err.publicMessage = 'LLM is not configured on the server';
    throw err;
  }

  if (!model) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const [selectedModel] = getCandidateModels();
    modelName = selectedModel;
    model = genAI.getGenerativeModel({ model: selectedModel });
  }

  return model;
}

function resetModel() {
  model = null;
  modelName = null;
}

function isModelNotFoundError(err) {
  const message = (err?.message || String(err)).toLowerCase();
  return err?.status === 404 || message.includes('not found') || message.includes('is not supported');
}

function isInvalidImageError(err) {
  const message = (err?.message || String(err)).toLowerCase();
  return err?.status === 400 && (
    message.includes('provided image is not valid') ||
    message.includes('unable to process input image')
  );
}

const PROMPT_TEMPLATE = `You are a statistical medical triage assistant.

Given the user's symptoms: {{symptoms}}

Your task:
- Output ONLY strict JSON in this format:
{
  "condition": "...",
  "severity": 1,
  "reasoning": "..."
}

Rules:
- No medical advice.
- Only statistical likelihood.
- Severity must be an integer: 1 = mild, 2 = moderate, 3 = severe.
- Use severity 3 for dangerous symptoms (chest pain, fainting, stroke signs, severe bleeding, difficulty breathing).
- Do NOT include markdown, code fences, or any text outside the JSON.`;

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Gemini returned empty text');
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    // Fall back to extracting the first JSON object from mixed text.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Gemini returned non-JSON output');
    }

    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (err) {
      throw new Error(`Gemini JSON parse failed: ${err.message}`);
    }
  }
}

function validateAndNormalize(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Invalid LLM response shape');
  }

  const condition = typeof obj.condition === 'string' ? obj.condition.trim() : '';
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim() : '';
  const severity = Number(obj.severity);

  if (!condition) {
    throw new Error('Invalid LLM response: condition is required');
  }
  if (!reasoning) {
    throw new Error('Invalid LLM response: reasoning is required');
  }
  if (!Number.isInteger(severity) || severity < 1 || severity > 3) {
    throw new Error('Invalid LLM response: severity must be 1, 2, or 3');
  }

  return { condition, severity, reasoning };
}

function normalizeGeminiError(err) {
  const statusCode = Number.isInteger(err?.status) ? err.status : 503;
  const message = err?.message || String(err);
  const lower = message.toLowerCase();
  const normalized = new Error(`Gemini call failed: ${message}`);
  normalized.statusCode = statusCode >= 400 ? statusCode : 503;
  if (statusCode === 400) {
    if (lower.includes('image')) {
      normalized.publicMessage = 'Uploaded image could not be processed. Try a clear JPG or PNG image.';
    } else {
      normalized.publicMessage = 'Invalid input for diagnosis request';
    }
  } else {
    normalized.publicMessage = 'Diagnosis service temporarily unavailable';
  }
  return normalized;
}

function normalizeImage(image) {
  if (!image) return null;
  const mimeType = image.mimeType.trim().toLowerCase();
  let data = image.data.trim();

  const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const [, dataUrlMimeType, base64Data] = dataUrlMatch;
    data = base64Data;
    if (dataUrlMimeType) {
      return { mimeType: dataUrlMimeType.trim().toLowerCase(), data };
    }
  }

  return { mimeType, data };
}

async function generateDiagnosis(input) {
  const symptoms = input?.symptoms;
  const image = input?.image || null;

  if (!Array.isArray(symptoms) || !symptoms.every((s) => typeof s === 'string' && s.trim())) {
    const err = new Error('Invalid symptoms input');
    err.statusCode = 400;
    err.publicMessage = 'Invalid symptoms input';
    throw err;
  }

  if (image) {
    if (
      typeof image !== 'object' ||
      typeof image.data !== 'string' ||
      typeof image.mimeType !== 'string' ||
      !image.data.trim() ||
      !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType.trim())
    ) {
      const err = new Error('Invalid image input');
      err.statusCode = 400;
      err.publicMessage = 'Invalid image input';
      throw err;
    }
  }

  if (symptoms.length < 1 && !image) {
    const err = new Error('Either symptoms text or an image is required');
    err.statusCode = 400;
    err.publicMessage = 'Either symptoms text or an image is required';
    throw err;
  }

  const symptomsStr = symptoms.length > 0
    ? symptoms.map((s) => s.trim()).join(', ')
    : 'No textual symptoms provided.';
  const imageGuidance = image
    ? 'An image is attached. Use visual evidence from the image together with symptoms.'
    : 'No image is attached. Use only symptoms text.';
  const prompt = `${PROMPT_TEMPLATE.replace('{{symptoms}}', symptomsStr)}\n\n${imageGuidance}`;

  const parts = [{ text: prompt }];
  if (image) {
    const normalizedImage = normalizeImage(image);
    parts.push({
      inlineData: {
        mimeType: normalizedImage.mimeType,
        data: normalizedImage.data,
      },
    });
  }

  const requestPayload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };

  let result;
  let lastError = null;
  const candidateModels = image ? getImageCandidateModels() : getCandidateModels();

  for (const candidate of candidateModels) {
    try {
      if (!model || modelName !== candidate) {
        resetModel();
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: candidate });
        modelName = candidate;
      }

      result = await getModel().generateContent(requestPayload);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const retryNext = isModelNotFoundError(err) || (image && isInvalidImageError(err));
      if (!retryNext) break;
      console.warn(`Gemini model unavailable: ${candidate}. Trying next configured model.`);
      resetModel();
    }
  }

  if (lastError) {
    console.error('Gemini API call failed:', lastError?.message || String(lastError));
    throw normalizeGeminiError(lastError);
  }

  const response = result?.response;
  const text = response?.text ? response.text() : '';

  let parsed;
  try {
    parsed = parseJsonFromText(text);
  } catch (err) {
    const wrapped = new Error(err.message);
    wrapped.statusCode = 503;
    wrapped.publicMessage = 'Diagnosis service returned malformed output';
    throw wrapped;
  }

  try {
    return validateAndNormalize(parsed);
  } catch (err) {
    const wrapped = new Error(err.message);
    wrapped.statusCode = 503;
    wrapped.publicMessage = 'Diagnosis service returned an invalid response';
    throw wrapped;
  }
}

module.exports = { generateDiagnosis };
