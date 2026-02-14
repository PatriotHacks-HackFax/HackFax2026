const express = require('express');
const { diagnose } = require('../controllers/diagnoseController');

const router = express.Router();
router.post('/diagnose', diagnose);

module.exports = router;
