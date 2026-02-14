const express = require('express');
const { getHospitalWaitTimes } = require('../controllers/waittimesController');

const router = express.Router();
router.post('/waittimes', getHospitalWaitTimes);

module.exports = router;
