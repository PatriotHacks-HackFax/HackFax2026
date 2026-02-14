const llmService = require('../services/llmService');

const UNSAFE_PATTERNS = [
  /self[- ]?harm/i,
  /suicide/i,
  /kill\s+myself/i,
  /end\s+my\s+life/i,
  /hurt\s+myself/i,
];

function isUnsafeInput(symptoms) {
  const text = Array.isArray(symptoms) ? symptoms.join(' ').toLowerCase() : String(symptoms).toLowerCase();
  return UNSAFE_PATTERNS.some((re) => re.test(text));
}

function diagnose(req, res) {
  const { symptoms } = req.body;

  if (symptoms === undefined || symptoms === null) {
    return res.status(400).json({ error: 'symptoms required' });
  }
  if (!Array.isArray(symptoms)) {
    return res.status(400).json({ error: 'symptoms must be an array' });
  }
  if (symptoms.length < 1) {
    return res.status(400).json({ error: 'symptoms must contain at least one item' });
  }
  const allStrings = symptoms.every((s) => typeof s === 'string');
  if (!allStrings) {
    return res.status(400).json({ error: 'symptoms must contain only strings' });
  }

  if (isUnsafeInput(symptoms)) {
    return res.status(400).json({ error: 'unsafe_input' });
  }

  llmService
    .generateDiagnosis(symptoms)
    .then((result) => {
      res.json({
        condition: result.condition,
        severity: result.severity,
        reasoning: result.reasoning,
      });
    })
    .catch(() => {
      res.status(503).json({ error: 'llm_failure' });
    });
}

module.exports = { diagnose };
