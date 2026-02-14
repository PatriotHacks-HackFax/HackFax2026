const mongoose = require('mongoose');
const config = require('./index');

let isConnected = false;

async function connect() {
  if (isConnected) return mongoose.connection;
  if (!config.mongoUri) {
    console.warn('MONGODB_URI not set — DB operations will fail until .env is configured.');
    return null;
  }
  const conn = await mongoose.connect(config.mongoUri);
  isConnected = true;
  console.log('MongoDB connected');
  return conn;
}

function getClient() {
  return mongoose.connection;
}

module.exports = { connect, getClient };
