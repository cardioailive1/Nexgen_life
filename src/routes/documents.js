// src/routes/documents.js
const router = require('express').Router();
const { body, query } = require('express-validator');
const { authenticate } = require('../middleware/authenticate');
const { requireSubscription } = require('../middleware/requireSubscription');
const { validate } = require('../middleware/validate');
const documentService = require('../services/documentService');
const { auditLog } = require('../services/auditService');

// All document routes require authentication + active subscription
router.use(authenticate);
router.use(requireSubscription);

// ── Generate document ─────────────────────────────────────────────────────────
router.post('/generate',
  [
    body('documentType').notEmpty().isLength({ max: 100 }),
    body('jurisdiction').notEmpty().isLength({ max: 100 }),
    body('product').optional().isLength({ max: 200 }),
    body('indication').optional().isLength({ max: 200 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const doc = await documentService.generate(req.user.id, req.body);
      await auditLog({ action: 'DOCUMENT_GENERATED', userId: req.user.id, req, resourceId: doc.id, metadata: { documentType: req.body.documentType, jurisdiction: req.body.jurisdiction } });
      res.status(201).json({ success: true, document: doc });
    } catch (err) { next(err); }
  }
);

// ── List documents ─────────────────────────────────────────────────────────────
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page  = parseInt(req.query.page  || '1');
      const limit = parseInt(req.query.limit || '20');
      const result = await documentService.listByUser(req.user.id, page, limit);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }
);

// ── Get single document ────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await documentService.getById(req.params.id, req.user.id);
    res.json({ success: true, document: doc });
  } catch (err) { next(err); }
});

// ── Delete document ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await documentService.softDelete(req.params.id, req.user.id);
    await auditLog({ action: 'DOCUMENT_DELETED', userId: req.user.id, req, resourceId: req.params.id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
