const { GoogleGenerativeAI } = require('@google/generative-ai');

let model = null;
function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required. Set it in .env');
  if (!model) {
    model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return model;
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

function stripMarkdownAndParse(text) {
  let raw = (text || '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) raw = jsonMatch[0];
  return JSON.parse(raw);
}

function validateAndNormalize(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const condition = typeof obj.condition === 'string' ? obj.condition : String(obj.condition || '');
  let severity = Number(obj.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 3) severity = 1;
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : String(obj.reasoning || '');
  return { condition, severity, reasoning };
}

async function generateDiagnosis(symptoms) {
  const symptomsStr = Array.isArray(symptoms) ? symptoms.join(', ') : String(symptoms);
  const prompt = PROMPT_TEMPLATE.replace('{{symptoms}}', symptomsStr);

  const result = await getModel().generateContent(prompt);
  const response = result.response;
  if (!response || !response.text) {
    throw new Error('Gemini returned no text');
  }

  const text = response.text();
  const parsed = stripMarkdownAndParse(text);
  const normalized = validateAndNormalize(parsed);
  if (!normalized) throw new Error('Invalid LLM response shape');
  return normalized;
}

module.exports = { generateDiagnosis };
