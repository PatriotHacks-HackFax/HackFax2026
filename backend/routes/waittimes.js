const express = require('express');
const { stub } = require('../controllers/waittimesController');

const router = express.Router();
router.post('/waittimes', stub);

module.exports = router;
