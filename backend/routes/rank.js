const express = require('express');
const { stub } = require('../controllers/rankController');

const router = express.Router();
router.post('/rank', stub);

module.exports = router;
