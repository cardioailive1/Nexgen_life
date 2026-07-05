// src/services/tokenService.js
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY  = process.env.JWT_EXPIRES_IN  || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRY, issuer: 'nexgenlife', audience: 'nexgenlife-api' }
  );
}

function generateRefreshTokenValue() {
  return uuidv4() + '.' + crypto.randomUUID();
}

async function generateTokens(user, ip, userAgent) {
  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshTokenValue();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: { userId: user.id, refreshToken, ipAddress: ip, userAgent, expiresAt },
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_EXPIRY };
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET, { issuer: 'nexgenlife', audience: 'nexgenlife-api' });
  } catch (err) {
    throw new AppError('Invalid or expired access token.', 401);
  }
}

function verifyRefreshToken(token) {
  try {
    // Refresh tokens are opaque UUIDs — just parse, no JWT verify needed
    if (!token || typeof token !== 'string') throw new Error('Invalid');
    return { valid: true };
  } catch {
    throw new AppError('Invalid refresh token.', 401);
  }
}

module.exports = { generateTokens, generateAccessToken, verifyAccessToken, verifyRefreshToken };
