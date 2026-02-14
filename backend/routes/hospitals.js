const express = require('express');
const { stub } = require('../controllers/hospitalsController');

const router = express.Router();
router.post('/hospitals', stub);

module.exports = router;
