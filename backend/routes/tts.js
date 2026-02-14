const express = require('express');
const { synthesize } = require('../controllers/ttsController');

const router = express.Router();
router.post('/tts', synthesize);

module.exports = router;
