const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SUPPORTED_LANGUAGES } = require('./ttsService');

let model = null;
let modelName = null;
const DEFAULT_LANGUAGE_CODE = 'en';
const LANGUAGE_LABELS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  hi: 'Hindi',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  ru: 'Russian',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  id: 'Indonesian',
  fil: 'Filipino',
  ta: 'Tamil',
  te: 'Telugu',
  cs: 'Czech',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  hu: 'Hungarian',
  no: 'Norwegian',
  ro: 'Romanian',
  sk: 'Slovak',
};

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
  "reasoning": "...",
  "languageCode": "en"
}

Rules:
- No medical advice.
- Only statistical likelihood.
- Severity must be an integer: 1 = mild, 2 = moderate, 3 = severe.
- languageCode must be a lowercase ISO 639-1 code.
- Use severity 3 for dangerous symptoms (chest pain, fainting, stroke signs, severe bleeding, difficulty breathing).
- Do NOT include markdown, code fences, or any text outside the JSON.`;

function getLanguageDisplayName(code) {
  return LANGUAGE_LABELS[code] || code;
}

function buildDiagnosisTranslationPrompt(condition, reasoning, targetLanguageCode) {
  const languageName = getLanguageDisplayName(targetLanguageCode);
  return `Translate the following medical triage fields into ${languageName}.

Return ONLY strict JSON in this format:
{
  "condition": "...",
  "reasoning": "..."
}

Rules:
- Translate faithfully.
- Keep clinical meaning intact.
- Do not add advice.
- No markdown or extra text.

Input:
condition: ${condition}
reasoning: ${reasoning}`;
}

const AUDIO_TRANSCRIBE_PROMPT = `You are a medical intake transcription assistant.

You are given an audio recording of a patient describing symptoms.

Return ONLY strict JSON in this format:
{
  "symptomsText": "...",
  "languageCode": "en"
}

Rules:
- Transcribe what the user said about symptoms as accurately as possible into symptomsText.
- Keep symptomsText in the same language spoken by the user.
- languageCode must be lowercase ISO 639-1 and one of: ${SUPPORTED_LANGUAGES.join(', ')}.
- If unsure, use "en".
- Do NOT include markdown, code fences, or text outside JSON.`;

const AUDIO_LANGUAGE_DETECT_PROMPT = `Identify the primary spoken language in this audio clip.

Return ONLY strict JSON in this format:
{
  "languageCode": "en"
}

Rules:
- languageCode must be lowercase ISO 639-1.
- Choose only from: ${SUPPORTED_LANGUAGES.join(', ')}.
- Do not default to English if another language is clearly spoken.
- Telugu must be returned as "te".
- Do NOT include markdown, code fences, or extra text.`;

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

function validateAndNormalize(obj, fallbackLanguageCode) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Invalid LLM response shape');
  }

  const condition = typeof obj.condition === 'string' ? obj.condition.trim() : '';
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim() : '';
  const severity = Number(obj.severity);
  const rawLanguageCode = typeof obj.languageCode === 'string' ? obj.languageCode.trim().toLowerCase() : '';
  const languageCode = SUPPORTED_LANGUAGES.includes(rawLanguageCode)
    ? rawLanguageCode
    : fallbackLanguageCode;

  if (!condition) {
    throw new Error('Invalid LLM response: condition is required');
  }
  if (!reasoning) {
    throw new Error('Invalid LLM response: reasoning is required');
  }
  if (!Number.isInteger(severity) || severity < 1 || severity > 3) {
    throw new Error('Invalid LLM response: severity must be 1, 2, or 3');
  }

  return { condition, severity, reasoning, languageCode };
}

function detectLanguageFromSymptoms(symptoms) {
  const text = symptoms.join(' ');
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  return DEFAULT_LANGUAGE_CODE;
}

function validateAudioInput(audio) {
  if (
    !audio ||
    typeof audio !== 'object' ||
    typeof audio.data !== 'string' ||
    typeof audio.mimeType !== 'string' ||
    !audio.data.trim()
  ) {
    const err = new Error('Invalid audio input');
    err.statusCode = 400;
    err.publicMessage = 'Invalid audio input';
    throw err;
  }
  const rawMimeType = audio.mimeType.trim().toLowerCase();
  const mimeType = rawMimeType.split(';')[0].trim();
  if (!/^audio\/[a-z0-9.+-]+$/.test(mimeType)) {
    const err = new Error('Invalid audio MIME type');
    err.statusCode = 400;
    err.publicMessage = 'Invalid audio MIME type';
    throw err;
  }
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

async function callGeminiJson(requestPayload, candidateModels) {
  let result;
  let lastError = null;

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
      const retryNext = isModelNotFoundError(err);
      if (!retryNext) break;
      resetModel();
    }
  }

  if (lastError) {
    throw normalizeGeminiError(lastError);
  }

  const text = result?.response?.text ? result.response.text() : '';
  return parseJsonFromText(text);
}

async function translateDiagnosisFields(diagnosis, targetLanguageCode) {
  if (!targetLanguageCode || targetLanguageCode === 'en') {
    return diagnosis;
  }

  const prompt = buildDiagnosisTranslationPrompt(
    diagnosis.condition,
    diagnosis.reasoning,
    targetLanguageCode
  );

  const parsed = await callGeminiJson({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  }, getCandidateModels());

  const translatedCondition = typeof parsed?.condition === 'string' ? parsed.condition.trim() : '';
  const translatedReasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : '';

  if (!translatedCondition || !translatedReasoning) {
    return diagnosis;
  }

  return {
    ...diagnosis,
    condition: translatedCondition,
    reasoning: translatedReasoning,
    languageCode: targetLanguageCode,
  };
}

async function generateDiagnosis(input) {
  const symptoms = input?.symptoms;
  const image = input?.image || null;
  const candidateLanguageCode = typeof input?.languageCode === 'string' && input.languageCode.trim()
    ? input.languageCode.trim().toLowerCase()
    : null;
  const requestedLanguageCode = (candidateLanguageCode && SUPPORTED_LANGUAGES.includes(candidateLanguageCode))
    ? candidateLanguageCode
    : null;

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
  const autoDetectedLanguageCode = detectLanguageFromSymptoms(symptoms);
  const fallbackLanguageCode = requestedLanguageCode || autoDetectedLanguageCode;
  const languageLabel = requestedLanguageCode ? (LANGUAGE_LABELS[requestedLanguageCode] || requestedLanguageCode) : null;
  const languageInstruction = requestedLanguageCode
    ? (requestedLanguageCode === 'en'
      ? 'Return "condition" and "reasoning" in English and set "languageCode" to "en".'
      : `Return "condition" and "reasoning" in ${languageLabel} and set "languageCode" to "${requestedLanguageCode}".`)
    : `Detect the primary language used in symptoms and return "condition" and "reasoning" in that same language. Set "languageCode" to one of: ${SUPPORTED_LANGUAGES.join(', ')}. If uncertain, use "en".`;
  const prompt = `${PROMPT_TEMPLATE.replace('{{symptoms}}', symptomsStr)}\n\n${imageGuidance}\n${languageInstruction}`;

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

  let parsed;
  try {
    parsed = await callGeminiJson(requestPayload, image ? getImageCandidateModels() : getCandidateModels());
  } catch (err) {
    const lower = String(err?.message || '').toLowerCase();
    const isImageIssue = image && lower.includes('image');
    if (isImageIssue) {
      const wrapped = new Error('Uploaded image could not be processed');
      wrapped.statusCode = 400;
      wrapped.publicMessage = 'Uploaded image could not be processed. Try a clear JPG or PNG image.';
      throw wrapped;
    }
    const wrapped = new Error(err.message);
    wrapped.statusCode = 503;
    wrapped.publicMessage = 'Diagnosis service returned malformed output';
    throw wrapped;
  }

  try {
    const normalized = validateAndNormalize(parsed, fallbackLanguageCode);
    const targetLanguageCode = requestedLanguageCode || normalized.languageCode || fallbackLanguageCode;
    return await translateDiagnosisFields(
      { ...normalized, languageCode: targetLanguageCode },
      targetLanguageCode
    );
  } catch (err) {
    const wrapped = new Error(err.message);
    wrapped.statusCode = 503;
    wrapped.publicMessage = 'Diagnosis service returned an invalid response';
    throw wrapped;
  }
}

async function transcribeSymptomsFromAudio(input) {
  const audio = input?.audio;
  validateAudioInput(audio);
  const normalizedMimeType = audio.mimeType.trim().toLowerCase().split(';')[0].trim();
  const audioData = audio.data.trim();

  const parsed = await callGeminiJson({
    contents: [{
      role: 'user',
      parts: [
        { text: `${AUDIO_TRANSCRIBE_PROMPT}\n\nImportant: NEVER translate to English. Preserve the spoken language exactly.` },
        {
          inlineData: {
            mimeType: normalizedMimeType,
            data: audioData,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  }, getCandidateModels());
  const symptomsText = typeof parsed?.symptomsText === 'string' ? parsed.symptomsText.trim() : '';
  const rawLang = typeof parsed?.languageCode === 'string' ? parsed.languageCode.trim().toLowerCase() : '';
  let languageCode = SUPPORTED_LANGUAGES.includes(rawLang) ? rawLang : DEFAULT_LANGUAGE_CODE;

  try {
    const langParsed = await callGeminiJson({
      contents: [{
        role: 'user',
        parts: [
          { text: AUDIO_LANGUAGE_DETECT_PROMPT },
          {
            inlineData: {
              mimeType: normalizedMimeType,
              data: audioData,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }, getCandidateModels());

    const languageFromAudio = typeof langParsed?.languageCode === 'string'
      ? langParsed.languageCode.trim().toLowerCase()
      : '';
    if (SUPPORTED_LANGUAGES.includes(languageFromAudio)) {
      languageCode = languageFromAudio;
    }
  } catch {
    // Keep transcription-provided language if dedicated language detection fails.
  }

  if (languageCode === 'en' && symptomsText) {
    const scriptGuess = detectLanguageFromSymptoms([symptomsText]);
    if (scriptGuess && scriptGuess !== 'en') {
      languageCode = scriptGuess;
    }
  }

  if (!symptomsText) {
    const err = new Error('Transcription failed');
    err.statusCode = 503;
    err.publicMessage = 'Transcription service returned invalid output';
    throw err;
  }

  return { symptomsText, languageCode };
}

module.exports = { generateDiagnosis, transcribeSymptomsFromAudio };
