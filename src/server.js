// src/server.js — NexGenLife Express Server
// SOC2 · GDPR · ISO 27001 · OAuth2 · Render.com production ready
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');

const { logger } = require('./config/logger');
const { prisma } = require('./config/database');
const { limiter, authLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { requestId } = require('./middleware/requestId');
const { auditMiddleware } = require('./middleware/audit');

// Routes
const authRoutes       = require('./routes/auth');
const oauthRoutes      = require('./routes/oauth');
const userRoutes       = require('./routes/users');
const documentRoutes   = require('./routes/documents');
const subscriptionRoutes = require('./routes/subscriptions');
const webhookRoutes    = require('./routes/webhooks');
const enterpriseRoutes = require('./routes/enterprise');
const complianceRoutes = require('./routes/compliance');
const healthRoutes     = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Trust proxy (required on Render.com) ─────────────────────────────────────
app.set('trust proxy', 1);

// ── Security Headers (SOC2 CC6.1) ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://nexgenlife.onrender.com", "https://nesgenlife.studio", "https://api.anthropic.com", "https://api.stripe.com", "https://formspree.io"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: { features: { geolocation: [], microphone: [], camera: [] } },
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://nesgenlife.studio,https://nexgenlife.onrender.com')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: function(origin, cb) {
    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked origin: ${origin}`);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
}));

// Explicitly handle preflight for all routes
app.options('*', cors());

// ── Stripe webhook MUST use raw body ─────────────────────────────────────────
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(compression());

// ── Request ID (SOC2 traceability) ────────────────────────────────────────────
app.use(requestId);

// ── HTTP logging ─────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.url === '/health',
}));

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use(limiter);

// ── Audit middleware (SOC2 CC7.2) ─────────────────────────────────────────────
app.use(auditMiddleware);

// ── Serve static frontend ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  etag: true,
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/health',          healthRoutes);
app.use('/webhooks',        webhookRoutes);
app.use('/auth',            authLimiter, authRoutes);
app.use('/auth',            oauthRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/documents',   documentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/enterprise',  enterpriseRoutes);
app.use('/api/compliance',  complianceRoutes);

// ── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
    app.listen(PORT, () => {
      logger.info(`🚀 NexGenLife server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start();
module.exports = app;
