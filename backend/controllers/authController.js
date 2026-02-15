const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

function buildToken(user) {
  return jwt.sign(
    { email: user.email },
    config.jwtSecret,
    { subject: String(user._id), expiresIn: config.jwtExpiresIn }
  );
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    age: user.age ?? null,
    gender: user.gender || '',
    heightCm: user.heightCm ?? null,
    weightKg: user.weightKg ?? null,
    emergencyContacts: Array.isArray(user.emergencyContacts) ? user.emergencyContacts : [],
  };
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) return null;

  const cleaned = contacts
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      name: String(c.name || '').trim(),
      relation: String(c.relation || '').trim(),
      phone: String(c.phone || '').trim(),
    }))
    .filter((c) => c.name || c.relation || c.phone);

  if (cleaned.length < 1) return null;
  if (cleaned.some((c) => !c.name || !c.relation || !c.phone)) return null;
  return cleaned;
}

function normalizeProfileFields(body) {
  const name = String(body?.name || '').trim();
  const age = Number(body?.age);
  const gender = String(body?.gender || '').trim().toLowerCase();
  const heightCm = Number(body?.heightCm);
  const weightKg = Number(body?.weightKg);
  const emergencyContacts = normalizeContacts(body?.emergencyContacts);

  const allowedGenders = ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'];

  if (!name) return { error: 'Name is required' };
  if (!Number.isFinite(age) || age < 1 || age > 130) {
    return { error: 'Age is required and must be between 1 and 130' };
  }
  if (!allowedGenders.includes(gender)) {
    return { error: 'Gender is required and must be one of: male, female, non-binary, other, prefer_not_to_say' };
  }
  if (!Number.isFinite(heightCm) || heightCm < 30 || heightCm > 300) {
    return { error: 'Height is required and must be between 30 and 300 cm' };
  }
  if (!Number.isFinite(weightKg) || weightKg < 2 || weightKg > 500) {
    return { error: 'Weight is required and must be between 2 and 500 kg' };
  }
  if (!emergencyContacts) {
    return { error: 'At least one complete emergency contact (name, relation, phone) is required' };
  }

  return {
    data: {
      name,
      age: Math.round(age),
      gender,
      heightCm: Math.round(heightCm),
      weightKg: Math.round(weightKg),
      emergencyContacts,
    },
  };
}

async function signup(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      age: null,
      gender: '',
      heightCm: null,
      weightKg: null,
      emergencyContacts: [],
    });
    const token = buildToken(user);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('signup error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}

async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = buildToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

async function me(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

async function updateProfile(req, res) {
  try {
    const normalized = normalizeProfileFields(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const user = await User.findByIdAndUpdate(req.user.id, normalized.data, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

module.exports = { signup, login, me, updateProfile };
