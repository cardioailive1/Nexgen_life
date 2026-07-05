// src/middleware/authenticate.js
const { verifyAccessToken } = require('../services/tokenService');
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AppError('Authentication required.', 401);

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, fullName: true, role: true, status: true, emailVerified: true, mfaEnabled: true },
    });

    if (!user) throw new AppError('User not found.', 401);
    if (user.status === 'SUSPENDED') throw new AppError('Account suspended. Contact support@corverxis.com.', 403);
    if (user.status === 'DELETED')   throw new AppError('Account not found.', 404);

    req.user = user;
    next();
  } catch (err) { next(err); }
}

module.exports = { authenticate };
