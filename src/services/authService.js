// src/services/authService.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { generateTokens, verifyRefreshToken } = require('./tokenService');
const { sendEmail } = require('./emailService');
const { AppError } = require('../utils/AppError');
const { logger } = require('../config/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const RESET_EXPIRY_HOURS = 2;
const VERIFY_EXPIRY_HOURS = 24;

// ── Register ──────────────────────────────────────────────────────────────────
async function register(data, ip, userAgent) {
  const { email, password, fullName, organisation, privacyPolicyAccepted, termsAccepted } = data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('An account with that email already exists.', 409);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() + parseInt(process.env.DATA_RETENTION_DAYS || '2555'));

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      organisation,
      status: 'PENDING_VERIFICATION',
      privacyPolicyAccepted: privacyPolicyAccepted === 'true' || privacyPolicyAccepted === true,
      privacyPolicyVersion: '1.0.0',
      privacyAcceptedAt: new Date(),
      termsAcceptedAt: termsAccepted ? new Date() : null,
      dataRetentionUntil: retentionDate,
      lastLoginIp: ip,
    },
    select: safeUserSelect,
  });

  // Send verification email
  await sendVerificationEmail(user.id, email, fullName);

  const tokens = await generateTokens(user, ip, userAgent);
  return { user, ...tokens };
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login({ email, password, totpCode, ip, userAgent }) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time check to prevent timing attacks
  const dummyHash = '$2a$12$dummy.hash.for.timing.attack.prevention.padding.here';
  const passwordMatch = user
    ? await bcrypt.compare(password, user.passwordHash || dummyHash)
    : await bcrypt.compare(password, dummyHash);

  if (!user || !passwordMatch) {
    throw new AppError('Incorrect email or password.', 401);
  }

  if (user.status === 'SUSPENDED') throw new AppError('Your account has been suspended. Contact support@corverxis.com.', 403);
  if (user.status === 'DELETED')    throw new AppError('This account has been deleted.', 403);

  // MFA check
  if (user.mfaEnabled) {
    if (!totpCode) throw new AppError('Two-factor authentication code required.', 403, 'MFA_REQUIRED');
    const { verifyTOTP } = require('./mfaService');
    const valid = await verifyTOTP(user.mfaSecret, totpCode);
    if (!valid) throw new AppError('Incorrect two-factor authentication code.', 401);
  }

  // Update login metadata
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip, loginCount: { increment: 1 } },
  });

  const safeUser = await prisma.user.findUnique({ where: { id: user.id }, select: safeUserSelect });
  const tokens = await generateTokens(safeUser, ip, userAgent);
  return { user: safeUser, ...tokens };
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshToken(token) {
  const payload = verifyRefreshToken(token);
  const session = await prisma.session.findUnique({ where: { refreshToken: token } });

  if (!session || !session.isValid || session.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: safeUserSelect });
  if (!user) throw new AppError('User not found.', 401);

  // Invalidate old session
  await prisma.session.update({ where: { id: session.id }, data: { isValid: false } });

  const tokens = await generateTokens(user, null, null);
  return { user, ...tokens };
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout(userId, refreshToken) {
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { userId, refreshToken },
      data: { isValid: false },
    });
  }
}

// ── Password Reset ────────────────────────────────────────────────────────────
async function requestPasswordReset(email, ip) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent — prevent enumeration

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 3600 * 1000);

  await prisma.passwordReset.create({ data: { userId: user.id, token, expiresAt } });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your NexGenLife password',
    html: `
      <p>Hi ${user.fullName || 'there'},</p>
      <p>Click the link below to reset your password. This link expires in ${RESET_EXPIRY_HOURS} hours.</p>
      <p><a href="${resetUrl}" style="background:#00C8FF;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p>— NexGenLife Team · <a href="mailto:support@corverxis.com">support@corverxis.com</a></p>
    `,
  });
}

async function resetPassword(token, newPassword) {
  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new AppError('This reset link is invalid or has expired.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Invalidate all sessions (SOC2 security)
    prisma.session.updateMany({ where: { userId: reset.userId }, data: { isValid: false } }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: reset.userId } });
  return user;
}

// ── Email Verification ────────────────────────────────────────────────────────
async function sendVerificationEmail(userId, email, fullName) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_EXPIRY_HOURS * 3600 * 1000);
  await prisma.emailVerification.create({ data: { userId, token, expiresAt } });

  const verifyUrl = `${process.env.APP_URL}/auth/verify-email/${token}`;
  await sendEmail({
    to: email,
    subject: 'Verify your NexGenLife email address',
    html: `
      <p>Hi ${fullName || 'there'},</p>
      <p>Please verify your email address to activate your NexGenLife account.</p>
      <p><a href="${verifyUrl}" style="background:#00C8FF;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p>
      <p>This link expires in ${VERIFY_EXPIRY_HOURS} hours.</p>
      <p>— NexGenLife Team</p>
    `,
  });
}

async function verifyEmail(token) {
  const ev = await prisma.emailVerification.findUnique({ where: { token } });
  if (!ev || ev.usedAt || ev.expiresAt < new Date()) {
    throw new AppError('Invalid or expired verification link.', 400);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: ev.userId }, data: { emailVerified: true, emailVerifiedAt: new Date(), status: 'ACTIVE' } }),
    prisma.emailVerification.update({ where: { id: ev.id }, data: { usedAt: new Date() } }),
  ]);
  const user = await prisma.user.findUnique({ where: { id: ev.userId } });
  return user;
}

const safeUserSelect = {
  id: true, email: true, fullName: true, organisation: true, role: true,
  status: true, emailVerified: true, mfaEnabled: true, avatarUrl: true,
  privacyPolicyAccepted: true, createdAt: true, lastLoginAt: true,
};

module.exports = { register, login, refreshToken, logout, requestPasswordReset, resetPassword, verifyEmail, sendVerificationEmail };
