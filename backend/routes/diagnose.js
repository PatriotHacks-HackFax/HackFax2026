const express = require('express');
const { stub } = require('../controllers/diagnoseController');

const router = express.Router();
router.post('/diagnose', stub);

module.exports = router;
