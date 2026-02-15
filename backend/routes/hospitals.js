const express = require('express');
const { nearby } = require('../controllers/hospitalsController');

const router = express.Router();
router.post('/hospitals', nearby);

module.exports = router;
