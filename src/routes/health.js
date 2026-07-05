// src/routes/health.js — Render.com health check endpoint
const router = require('express').Router();
const { prisma } = require('../config/database');

router.get('/', async (req, res) => {
  const checks = { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', env: process.env.NODE_ENV };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    checks.status = 'degraded';
  }
  res.status(checks.status === 'ok' ? 200 : 503).json(checks);
});

module.exports = router;
