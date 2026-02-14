const express = require('express');
const { rank } = require('../controllers/rankController');

const router = express.Router();
router.post('/rank', rank);

module.exports = router;
