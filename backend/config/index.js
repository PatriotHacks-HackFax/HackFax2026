require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // API keys - loaded from env, not used yet
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  // Add other API keys here as needed for later modules
};

module.exports = config;
