// src/middleware/rateLimiter.js — SOC2 CC6.1 rate limiting
const rateLimit = require('express-rate-limit');
const { auditLog } = require('../services/auditService');

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await auditLog({ action: 'RATE_LIMIT_HIT', req, success: false, metadata: { path: req.path } }).catch(() => {});
    res.status(429).json({ success: false, error: 'Too many requests. Please wait a moment and try again.' });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await auditLog({ action: 'RATE_LIMIT_HIT', req, success: false, metadata: { path: req.path, type: 'auth' } }).catch(() => {});
    res.status(429).json({ success: false, error: 'Too many authentication attempts. Please wait 15 minutes.' });
  },
});

module.exports = { limiter, authLimiter };
