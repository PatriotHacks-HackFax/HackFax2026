const jwt = require('jsonwebtoken');
const config = require('../config');

function decodeBearer(authHeader) {
  const [scheme, token] = String(authHeader || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return { id: decoded.sub, email: decoded.email };
  } catch (_err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const decoded = decodeBearer(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = decoded;
  return next();
}

function optionalAuth(req, _res, next) {
  const decoded = decodeBearer(req.headers.authorization);
  if (decoded) req.user = decoded;
  return next();
}

module.exports = { requireAuth, optionalAuth };
