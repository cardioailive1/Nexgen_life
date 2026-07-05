// src/config/database.js
const { PrismaClient } = require('@prisma/client');
const { logger } = require('./logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

// Log slow queries (SOC2 performance monitoring)
prisma.$on('query', (e) => {
  if (e.duration > 2000) {
    logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
prisma.$on('error', (e) => logger.error('Prisma error:', e));
prisma.$on('warn',  (e) => logger.warn('Prisma warning:', e));

module.exports = { prisma };
