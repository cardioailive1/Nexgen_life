// src/services/auditService.js — SOC2 CC7.2 Audit Trail
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '2555');

async function auditLog({ action, userId, req, resourceId, resource, success = true, failureReason, metadata } = {}) {
  try {
    const retainUntil = new Date();
    retainUntil.setDate(retainUntil.getDate() + RETENTION_DAYS);

    await prisma.auditLog.create({
      data: {
        userId:        userId || req?.user?.id || null,
        action,
        resource:      resource || null,
        resourceId:    resourceId || null,
        ipAddress:     req?.clientIp || req?.ip || null,
        userAgent:     req?.headers?.['user-agent'] || null,
        success,
        failureReason: failureReason || null,
        metadata:      metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        retainUntil,
      },
    });
  } catch (err) {
    // Never let audit log failure break the main flow
    logger.error('Audit log write failed:', err.message);
  }
}

module.exports = { auditLog };
