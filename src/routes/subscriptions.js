// src/routes/subscriptions.js
const router = require('express').Router();
const { authenticate } = require('../middleware/authenticate');
const { auditLog } = require('../services/auditService');
const subscriptionService = require('../services/subscriptionService');

router.use(authenticate);

// Get current subscription
router.get('/', async (req, res, next) => {
  try {
    const sub = await subscriptionService.getByUser(req.user.id);
    res.json({ success: true, subscription: sub });
  } catch (err) { next(err); }
});

// Create Stripe checkout session
router.post('/checkout', async (req, res, next) => {
  try {
    const { plan } = req.body;
    const session = await subscriptionService.createCheckoutSession(req.user, plan);
    res.json({ success: true, url: session.url });
  } catch (err) { next(err); }
});

// Create customer portal session (manage/cancel)
router.post('/portal', async (req, res, next) => {
  try {
    const session = await subscriptionService.createPortalSession(req.user);
    res.json({ success: true, url: session.url });
  } catch (err) { next(err); }
});

module.exports = router;
