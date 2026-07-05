// src/services/subscriptionService.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');

const PRICE_IDS = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
};

async function getByUser(userId) {
  return prisma.subscription.findUnique({ where: { userId } });
}

async function createCheckoutSession(user, plan) {
  const priceId = PRICE_IDS[plan?.toUpperCase()];
  if (!priceId) throw new AppError('Invalid plan selected.', 400);

  // Get or create Stripe customer
  let customerId;
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (sub?.stripeCustomerId) {
    customerId = sub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { userId: user.id, organisation: user.organisation || '' },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}?session_id={CHECKOUT_SESSION_ID}&plan=${plan.toLowerCase()}`,
    cancel_url: `${process.env.FRONTEND_URL}?checkout_cancelled=1`,
    metadata: { userId: user.id, plan: plan.toUpperCase() },
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_update: { address: 'auto' },
  });

  return session;
}

async function createPortalSession(user) {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeCustomerId) throw new AppError('No billing account found.', 404);

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: process.env.FRONTEND_URL,
  });

  return session;
}

module.exports = { getByUser, createCheckoutSession, createPortalSession };
