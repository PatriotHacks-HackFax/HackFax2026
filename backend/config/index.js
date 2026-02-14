require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || '',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
};

module.exports = config;
