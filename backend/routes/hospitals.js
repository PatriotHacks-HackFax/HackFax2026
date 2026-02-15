const express = require('express');
const { getHospitals } = require('../controllers/hospitalsController');

const router = express.Router();
router.post('/hospitals', getHospitals);

module.exports = router;
