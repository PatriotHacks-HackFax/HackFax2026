const express = require('express');
const diagnoseRoutes = require('./diagnose');
const hospitalsRoutes = require('./hospitals');
const waittimesRoutes = require('./waittimes');
const rankRoutes = require('./rank');
const ttsRoutes = require('./tts');

const router = express.Router();

router.use(diagnoseRoutes);
router.use(hospitalsRoutes);
router.use(waittimesRoutes);
router.use(rankRoutes);
router.use(ttsRoutes);

module.exports = router;
