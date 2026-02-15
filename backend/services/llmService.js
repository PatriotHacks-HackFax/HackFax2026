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

const AUDIO_TRANSCRIBE_PROMPT = `You are a strict medical transcription assistant. Listen carefully to this audio recording.

CRITICAL RULES:
- ONLY transcribe words that were clearly spoken by the patient. Do NOT invent, guess, or hallucinate any text.
- If the audio is silent, contains only noise, or has no clear speech, return symptomsText as an empty string "".
- Do NOT add any words, sentences, or symptoms that were not explicitly said.
- Preserve the patient's original spoken language exactly. Do NOT translate.
- If the patient speaks in Hindi, transcribe in Hindi. If Spanish, transcribe in Spanish. Etc.

Output ONLY strict JSON:
{
  "symptomsText": "...",
  "languageCode": "en"
}

Rules:
- symptomsText: ONLY the exact words spoken by the patient, nothing more. Empty string if no clear speech.
- languageCode: ISO 639-1 code of the spoken language (e.g. "en", "es", "hi", "te", "ar")
- Do NOT include markdown, code fences, or any text outside the JSON.`;

const AUDIO_LANGUAGE_DETECT_PROMPT = `Listen to this audio and detect the spoken language. Output ONLY strict JSON:
{
  "languageCode": "en"
}

Rules:
- languageCode: ISO 639-1 code of the spoken language
- Do NOT include markdown, code fences, or any text outside the JSON.`;

function buildDiagnosisTranslationPrompt(condition, reasoning, nextSteps, targetLanguageCode) {
  const langLabel = LANGUAGE_LABELS[targetLanguageCode] || targetLanguageCode;
  return `Translate the following medical diagnosis into ${langLabel} (${targetLanguageCode}). Keep it simple, use everyday words.

Condition: ${condition}
Reasoning: ${reasoning}
Next Steps: ${nextSteps || 'N/A'}

Output ONLY strict JSON:
{
  "condition": "...",
  "reasoning": "...",
  "nextSteps": "..."
}

Rules:
- Translate all fields into ${langLabel}.
- Keep the same meaning and tone.
- If Next Steps is "N/A", set nextSteps to an empty string.
- Do NOT include markdown, code fences, or any text outside the JSON.`;
}

const PROMPT_TEMPLATE = `You are a caring primary care doctor speaking directly to the patient. Use simple, everyday words—like you're talking to a family member.

Patient's symptoms: {{symptoms}}

Output ONLY strict JSON:
{
  "condition": "...",
  "severity": 1,
  "reasoning": "...",
  "nextSteps": "...",
  "languageCode": "en"
}

CRITICAL INSTRUCTIONS:

1. USE PATIENT DEMOGRAPHICS INTELLIGENTLY:
   - If patient info (age, gender, height, weight) is provided, use it to refine your assessment.
   - Consider how the patient's demographic profile affects likelihood of certain conditions (e.g. certain conditions are more common in specific age groups or demographics).
   - Do NOT explicitly mention the patient's age, weight, height, or BMI in your response. Instead, let those factors silently inform your conclusion.
   - Do NOT say things like "because you are 68" or "given your weight". Just use the info to give a more accurate assessment.

2. CONDITION: Use a short, plain name.
   - GOOD: "Insect bite or sting", "Chest pain concern"
   - BAD: "Localized inflammatory reaction", "mild infection"

3. REASONING: Write 3–5 sentences speaking directly to the patient. Be warm and clear.
   - Explain what could be going on and why their symptoms point to this.
   - Address their specific symptoms individually and how they connect.
   - Be specific to THEIR situation, not generic.

4. NEXT STEPS: Write 2–4 actionable sentences the patient can follow right now.
   - Include when to see a doctor vs. when it's safe to monitor at home.
   - Mention any red flags that should prompt immediate care.
   - Suggest simple things they can do at home if applicable (rest, ice, hydration, etc.).
   - For severity 3: emphasize urgency clearly.

BANNED PHRASES (never use these):
- "The image displays" / "The image shows"
- "statistically consistent" / "statistically"
- "The user's description" / "the user"
- "localized inflammatory" / "inflammatory response" / "inflammatory reaction"
- "further supports" / "aligns with" / "suggests a"
- "visual evidence" / "based on analysis"
- "Based on your age" / "Given your weight" / "At your age" / "your BMI"

GOOD reasoning example: "Your chest pain is something we should take seriously. The tightness you're feeling, especially with the shortness of breath, could be related to your heart. These symptoms together need prompt attention to rule out anything serious."

GOOD nextSteps example: "Please go to the nearest emergency room or call 911 right away. While waiting, sit upright and try to stay calm. Do not exert yourself physically. If you have aspirin available and are not allergic, chew one tablet."

BAD reasoning example: "The image displays a localized red area which is statistically consistent with an insect bite. The user's description further supports a significant local inflammatory response."

Rules:
- Speak directly to the patient using "you" and "your".
- No medical advice disclaimers inside the JSON (the app adds its own).
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

function validateAndNormalize(obj, fallbackLanguageCode) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Invalid LLM response shape');
  }

  const condition = typeof obj.condition === 'string' ? obj.condition.trim() : '';
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim() : '';
  const nextSteps = typeof obj.nextSteps === 'string' ? obj.nextSteps.trim() : '';
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

  return { condition, severity, reasoning, nextSteps, languageCode };
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
    diagnosis.nextSteps || '',
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
  const translatedNextSteps = typeof parsed?.nextSteps === 'string' ? parsed.nextSteps.trim() : '';

  if (!translatedCondition || !translatedReasoning) {
    return diagnosis;
  }

  return {
    ...diagnosis,
    condition: translatedCondition,
    reasoning: translatedReasoning,
    nextSteps: translatedNextSteps || diagnosis.nextSteps || '',
    languageCode: targetLanguageCode,
  };
}

function profileToPrompt(profile) {
  if (!profile) return '';
  const parts = [];
  if (profile.age) parts.push(`Age: ${profile.age}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  if (profile.heightCm) parts.push(`Height: ${profile.heightCm} cm`);
  if (profile.weightKg) parts.push(`Weight: ${profile.weightKg} kg`);
  return parts.length > 0 ? `\n\nPatient info: ${parts.join(', ')}` : '';
}

async function generateDiagnosis(input) {
  const symptoms = input?.symptoms;
  const image = input?.image || null;
  const profile = input?.profile || null;
  const requestedLanguageCode = input?.languageCode || null;
  const fallbackLanguageCode = requestedLanguageCode || detectLanguageFromSymptoms(symptoms || []);

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
  const profileStr = profileToPrompt(profile);
  const imageGuidance = image
    ? 'An image is attached. Use visual evidence from the image together with symptoms.'
    : 'No image is attached. Use only symptoms text.';
  const prompt = `${PROMPT_TEMPLATE.replace('{{symptoms}}', symptomsStr)}${profileStr}\n\n${imageGuidance}`;

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
