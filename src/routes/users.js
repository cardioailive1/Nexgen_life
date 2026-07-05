// src/routes/users.js
const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { auditLog } = require('../services/auditService');
const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/AppError');

router.use(authenticate);

// Get profile
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, fullName: true, organisation: true, jobTitle: true, country: true, role: true, status: true, emailVerified: true, mfaEnabled: true, avatarUrl: true, createdAt: true, subscription: { select: { plan: true, status: true, docsUsedThisMonth: true, docsLimitPerMonth: true, currentPeriodEnd: true } } },
  });
  res.json({ success: true, user });
});

// Update profile
router.patch('/me',
  [
    body('fullName').optional().trim().isLength({ max: 100 }),
    body('organisation').optional().trim().isLength({ max: 200 }),
    body('jobTitle').optional().trim().isLength({ max: 100 }),
    body('country').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { fullName, organisation, jobTitle, country } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { fullName, organisation, jobTitle, country },
        select: { id: true, email: true, fullName: true, organisation: true, jobTitle: true, country: true },
      });
      await auditLog({ action: 'USER_PROFILE_UPDATED', userId: req.user.id, req });
      res.json({ success: true, user });
    } catch (err) { next(err); }
  }
);

// Change password
router.post('/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const match = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
      if (!match) throw new AppError('Current password is incorrect.', 401);

      const passwordHash = await bcrypt.hash(req.body.newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
      await auditLog({ action: 'USER_PASSWORD_CHANGED', userId: req.user.id, req });
      res.json({ success: true, message: 'Password updated.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
