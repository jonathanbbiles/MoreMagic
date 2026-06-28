'use strict';

/**
 * auth.js — optional Bearer / x-api-key middleware.
 * -----------------------------------------------------------------------------
 * If API_TOKEN is empty, auth is disabled (pass-through) — handy for local dev
 * and paper testing. When set, protected routes require either
 *   Authorization: Bearer <token>   or   x-api-key: <token>.
 * /health is intentionally left public so uptime checks never need a secret.
 */

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function createAuthMiddleware(config) {
  const token = config.apiToken || '';
  return function authMiddleware(req, res, next) {
    if (!token) return next(); // auth disabled
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const apiKey = req.headers['x-api-key'] || '';
    if (timingSafeEqual(bearer, token) || timingSafeEqual(apiKey, token)) return next();
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  };
}

module.exports = { createAuthMiddleware, timingSafeEqual };
