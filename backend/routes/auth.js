const express = require('express');
const { signup, login, me, updateProfile } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/auth/me', requireAuth, me);
router.put('/auth/profile', requireAuth, updateProfile);

module.exports = router;
