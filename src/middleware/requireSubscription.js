// src/middleware/requireSubscription.js
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');

async function requireSubscription(req, res, next) {
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (!sub || sub.status !== 'ACTIVE') {
      return next(new AppError('An active subscription is required. Please choose a plan at nesgenlife.studio.', 403, 'SUBSCRIPTION_REQUIRED'));
    }
    req.subscription = sub;
    next();
  } catch (err) { next(err); }
}
module.exports = { requireSubscription };
