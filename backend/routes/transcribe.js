const express = require('express');
const { transcribeAudio } = require('../controllers/transcribeController');

const router = express.Router();

router.post('/transcribe-audio', transcribeAudio);

module.exports = router;
