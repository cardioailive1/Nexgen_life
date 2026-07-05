// src/services/emailService.js
const nodemailer = require('nodemailer');
const { logger } = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendEmail({ to, subject, html, text }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'NexGenLife <noreply@nesgenlife.studio>',
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, ''),
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`Email send failed to ${to}:`, err.message);
    // Don't throw — email failure shouldn't break auth flows
  }
}

module.exports = { sendEmail };
