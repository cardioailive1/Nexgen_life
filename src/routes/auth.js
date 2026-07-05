// src/routes/auth.js
const router = require('express').Router();
const { body } = require('express-validator');
const authService = require('../services/authService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const { auditLog } = require('../services/auditService');

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
    body('fullName').trim().notEmpty().isLength({ max: 100 }),
    body('organisation').optional().trim().isLength({ max: 200 }),
    body('privacyPolicyAccepted').equals('true'),
    body('termsAccepted').equals('true'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await authService.register(req.body, req.ip, req.headers['user-agent']);
      await auditLog({ action: 'USER_REGISTERED', userId: result.user.id, req, success: true });
      res.status(201).json({ success: true, ...result });
    } catch (err) { next(err); }
  }
);

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password, totpCode } = req.body;
      const result = await authService.login({ email, password, totpCode, ip: req.ip, userAgent: req.headers['user-agent'] });
      await auditLog({ action: 'USER_LOGIN', userId: result.user.id, req, success: true });
      res.json({ success: true, ...result });
    } catch (err) {
      await auditLog({ action: 'USER_LOGIN_FAILED', req, success: false, failureReason: err.message, metadata: { email: req.body.email } });
      next(err);
    }
  }
);

// ── Refresh Token ─────────────────────────────────────────────────────────────
router.post('/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }
);

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.user.id, req.body.refreshToken);
    await auditLog({ action: 'USER_LOGOUT', userId: req.user.id, req });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Forgot Password ───────────────────────────────────────────────────────────
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  async (req, res, next) => {
    try {
      await authService.requestPasswordReset(req.body.email, req.ip);
      await auditLog({ action: 'USER_PASSWORD_RESET_REQUESTED', req, metadata: { email: req.body.email } });
      // Always return success to prevent email enumeration (GDPR / SOC2)
      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (err) { next(err); }
  }
);

// ── Reset Password ────────────────────────────────────────────────────────────
router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await authService.resetPassword(req.body.token, req.body.password);
      await auditLog({ action: 'USER_PASSWORD_CHANGED', userId: user.id, req });
      res.json({ success: true, message: 'Password updated. Please sign in.' });
    } catch (err) { next(err); }
  }
);

// ── Verify Email ──────────────────────────────────────────────────────────────
router.get('/verify-email/:token', async (req, res, next) => {
  try {
    const user = await authService.verifyEmail(req.params.token);
    await auditLog({ action: 'USER_EMAIL_VERIFIED', userId: user.id, req });
    res.redirect(`${process.env.FRONTEND_URL}?verified=1`);
  } catch (err) { next(err); }
});

// ── Current user ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
