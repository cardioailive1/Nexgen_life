// src/routes/compliance.js — GDPR · SOC2 · ISO 27001
const router = require('express').Router();
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { auditLog } = require('../services/auditService');
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { logger } = require('../config/logger');

router.use(authenticate);

// ── GDPR: Request data export (Art. 20 — Data Portability) ───────────────────
router.post('/data-export', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const exportReq = await prisma.dataExport.create({
      data: { userId, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });

    // In production, trigger async job to build the export
    // For now, build inline and return JSON
    const [user, documents, subscription, auditLogs] = await prisma.$transaction([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, fullName: true, organisation: true, createdAt: true, privacyPolicyAccepted: true, privacyAcceptedAt: true } }),
      prisma.document.findMany({ where: { userId }, select: { id: true, documentType: true, jurisdiction: true, createdAt: true } }),
      prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true, createdAt: true } }),
      prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500, select: { action: true, createdAt: true, ipAddress: true } }),
    ]);

    const exportData = { exportedAt: new Date(), user, subscription, documents: { count: documents.length, items: documents }, activityLog: auditLogs };

    await prisma.dataExport.update({ where: { id: exportReq.id }, data: { completedAt: new Date(), status: 'COMPLETED' } });
    await auditLog({ action: 'USER_DATA_EXPORTED', userId, req });

    res.json({ success: true, data: exportData });
  } catch (err) { next(err); }
});

// ── GDPR: Request account deletion (Art. 17 — Right to Erasure) ──────────────
router.post('/deletion-request', async (req, res, next) => {
  try {
    const userId = req.user.id;
    await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date(), status: 'DELETED' } });
    // Soft delete — hard delete runs via scheduled job after 30 days
    await auditLog({ action: 'USER_DELETED', userId, req });
    res.json({ success: true, message: 'Account deletion requested. Your data will be permanently removed within 30 days per our retention policy.' });
  } catch (err) { next(err); }
});

// ── GDPR: Consent record ──────────────────────────────────────────────────────
router.post('/consent', async (req, res, next) => {
  try {
    const { policyVersion, marketingConsent } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        privacyPolicyAccepted: true,
        privacyPolicyVersion: policyVersion || '1.0.0',
        privacyAcceptedAt: new Date(),
        marketingConsent: marketingConsent === true,
        marketingConsentAt: marketingConsent === true ? new Date() : undefined,
      },
    });
    await auditLog({ action: 'CONSENT_RECORDED', userId: req.user.id, req, metadata: { policyVersion, marketingConsent } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── SOC2: Audit log access (admin only) ──────────────────────────────────────
router.get('/audit-logs', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '100');
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    res.json({ success: true, logs });
  } catch (err) { next(err); }
});

module.exports = router;
