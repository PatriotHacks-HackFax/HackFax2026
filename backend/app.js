const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(logger);

app.use('/', routes);

app.use(errorHandler);

module.exports = app;
