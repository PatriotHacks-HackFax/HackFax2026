const express = require('express');
const { diagnose } = require('../controllers/diagnoseController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.post('/diagnose', optionalAuth, diagnose);

module.exports = router;
