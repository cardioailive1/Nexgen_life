// src/config/logger.js — SOC2 CC7.2 compliant logging
const winston = require('winston');
require('winston-daily-rotate-file');

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isProd = process.env.NODE_ENV === 'production';

const transports = [
  new winston.transports.Console({
    format: isProd
      ? combine(timestamp(), errors({ stack: true }), json())
      : combine(colorize(), simple()),
  }),
];

// Production: daily rotating files (SOC2 log retention)
if (isProd) {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: `${process.env.AUDIT_LOG_RETENTION_DAYS || 2555}d`,
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: `${process.env.AUDIT_LOG_RETENTION_DAYS || 2555}d`,
      format: combine(timestamp(), errors({ stack: true }), json()),
    })
  );
}

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports,
  exitOnError: false,
});

module.exports = { logger };
