// src/routes/webhooks.js — Stripe webhook handler
const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { prisma } = require('../config/database');
const { auditLog } = require('../services/auditService');
const { logger } = require('../config/logger');

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  logger.info(`Stripe event: ${event.type}`);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (!userId) break;

        const plan = session.metadata?.plan?.toUpperCase() || 'STARTER';
        const docsLimit = plan === 'PROFESSIONAL' ? 999999 : 10;

        await prisma.subscription.upsert({
          where: { userId },
          update: { plan, status: 'ACTIVE', stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription, currentPeriodStart: new Date(), docsLimitPerMonth: docsLimit, docsUsedThisMonth: 0 },
          create: { userId, plan, status: 'ACTIVE', stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription, currentPeriodStart: new Date(), docsLimitPerMonth: docsLimit },
        });
        await auditLog({ action: 'SUBSCRIPTION_CREATED', userId, metadata: { plan, sessionId: session.id } });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: invoice.customer } });
        if (sub) {
          await prisma.payment.create({
            data: { subscriptionId: sub.id, stripeInvoiceId: invoice.id, amount: invoice.amount_paid, currency: invoice.currency, status: 'succeeded', paidAt: new Date(invoice.status_transitions.paid_at * 1000), receiptUrl: invoice.hosted_invoice_url },
          });
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', docsUsedThisMonth: 0, lastUsageResetAt: new Date() } });
          await auditLog({ action: 'PAYMENT_SUCCEEDED', userId: sub.userId, metadata: { amount: invoice.amount_paid, currency: invoice.currency } });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: invoice.customer } });
        if (sub) {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
          await auditLog({ action: 'PAYMENT_FAILED', userId: sub.userId, metadata: { invoiceId: invoice.id } });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } });
        if (sub) {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
          await auditLog({ action: 'SUBSCRIPTION_CANCELLED', userId: sub.userId });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: stripeSub.status.toUpperCase(),
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            },
          });
          await auditLog({ action: 'SUBSCRIPTION_UPDATED', userId: sub.userId });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
