require('dotenv').config();

function parsePort(value, fallback = 3000) {
  if (value === undefined || value === null || value === '') return fallback;
  const cleaned = String(value).trim().replace(/^['"]|['"]$/g, '');
  const port = Number.parseInt(cleaned, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return fallback;
  return port;
}

const config = {
  port: parsePort(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || '',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

module.exports = config;
