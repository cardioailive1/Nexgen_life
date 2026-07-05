// src/routes/enterprise.js
const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { prisma } = require('../config/database');
const { sendEmail } = require('../services/emailService');
const { AppError } = require('../utils/AppError');

router.post('/inquiry',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('organisation').trim().notEmpty().isLength({ max: 200 }),
    body('teamSize').optional().isLength({ max: 20 }),
    body('message').trim().notEmpty().isLength({ max: 5000 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, organisation, teamSize, message } = req.body;

      const inquiry = await prisma.enterpriseInquiry.create({
        data: { name, email, organisation, teamSize, message },
      });

      // Notify support
      await sendEmail({
        to: process.env.SUPPORT_EMAIL || 'support@corverxis.com',
        subject: `[NexGenLife Enterprise] ${organisation} — New Inquiry`,
        html: `
          <h2>New Enterprise Inquiry</h2>
          <table>
            <tr><td><strong>Name:</strong></td><td>${name}</td></tr>
            <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
            <tr><td><strong>Organisation:</strong></td><td>${organisation}</td></tr>
            <tr><td><strong>Team Size:</strong></td><td>${teamSize || 'Not specified'}</td></tr>
          </table>
          <h3>Message:</h3>
          <p>${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><small>Inquiry ID: ${inquiry.id} · Submitted: ${new Date().toISOString()}</small></p>
        `,
      });

      // Auto-reply to sender
      await sendEmail({
        to: email,
        subject: 'We received your NexGenLife Enterprise inquiry',
        html: `
          <p>Hi ${name},</p>
          <p>Thank you for your interest in NexGenLife Enterprise. Our team will be in touch within 1 business day.</p>
          <p>In the meantime, visit <a href="https://nesgenlife.studio">nesgenlife.studio</a> to explore the platform.</p>
          <p>— NexGenLife Team · <a href="mailto:support@corverxis.com">support@corverxis.com</a></p>
        `,
      });

      res.status(201).json({ success: true, message: 'Inquiry received. We\'ll be in touch within 1 business day.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
