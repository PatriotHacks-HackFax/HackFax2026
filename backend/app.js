const path = require('path');
const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(logger);

// API routes
app.use('/', routes);

// In production, serve the built frontend from ../frontend/dist
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// SPA fallback: any non-API route serves index.html
app.get('*', (req, res, next) => {
  // Don't intercept API-like paths (they'll 404 via errorHandler)
  if (req.path.startsWith('/auth') || req.path.startsWith('/diagnose') ||
      req.path.startsWith('/hospitals') || req.path.startsWith('/waittimes') ||
      req.path.startsWith('/rank') || req.path.startsWith('/tts') ||
      req.path.startsWith('/transcribe')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

module.exports = app;
