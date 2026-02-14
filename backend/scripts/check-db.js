require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

db.connect()
  .then((conn) => {
    if (conn) {
      console.log('MongoDB connected successfully');
      process.exit(0);
    } else {
      console.error('MONGODB_URI not set in .env');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
