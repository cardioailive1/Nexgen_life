// src/middleware/errorHandler.js
const { logger } = require('../config/logger');
const { AppError } = require('../utils/AppError');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    logger.error({ message: err.message, stack: err.stack, path: req.path, method: req.method, requestId: req.id });
  }

  // Never expose internal errors or stack traces in production
  const message = isProd && statusCode === 500
    ? 'An internal error occurred. Please try again or contact support@corverxis.com.'
    : err.message || 'Something went wrong.';

  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || undefined,
    ...((!isProd && statusCode >= 500) ? { stack: err.stack } : {}),
  });
}

module.exports = { errorHandler };
