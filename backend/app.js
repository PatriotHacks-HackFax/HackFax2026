const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(logger);

app.get('/', (req, res) => {
  const port = req.app.get('port') || process.env.PORT || 3000;
  res.type('html').send(`
<!DOCTYPE html>
<html><head><title>PatriotAI API</title></head><body style="font-family:sans-serif;padding:2rem;">
  <h1>PatriotAI backend is running</h1>
  <p>API server is available on port <strong>${port}</strong>.</p>
</body></html>
  `);
});

app.use('/', routes);

app.use(errorHandler);

module.exports = app;
