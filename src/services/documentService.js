// src/services/documentService.js
const Anthropic = require('@anthropic-ai/sdk');
const { prisma } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { logger } = require('../config/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Starter plan limit
const PLAN_LIMITS = { STARTER: 10, PROFESSIONAL: Infinity, ENTERPRISE: Infinity };

async function generate(userId, { documentType, jurisdiction, product, indication }) {
  // Check subscription doc limit
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new AppError('No active subscription found.', 403);

  const limit = PLAN_LIMITS[sub.plan] ?? 10;

  // Reset monthly counter if new month
  const now = new Date();
  const lastReset = sub.lastUsageResetAt;
  if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
    await prisma.subscription.update({ where: { userId }, data: { docsUsedThisMonth: 0, lastUsageResetAt: now } });
    sub.docsUsedThisMonth = 0;
  }

  if (sub.docsUsedThisMonth >= limit) {
    throw new AppError('You have reached your monthly document generation limit. Please upgrade your plan.', 429, 'LIMIT_EXCEEDED');
  }

  const prompt = buildPrompt({ documentType, jurisdiction, product, indication });
  const startMs = Date.now();

  // Create doc record
  const doc = await prisma.document.create({
    data: { userId, title: `${documentType} — ${jurisdiction}`, documentType, jurisdiction, product, indication, promptUsed: prompt, status: 'GENERATING' },
  });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0]?.text || '';
    const generationMs = Date.now() - startMs;

    await prisma.$transaction([
      prisma.document.update({
        where: { id: doc.id },
        data: { content, status: 'COMPLETED', tokenCount: message.usage?.output_tokens, generationMs, modelUsed: 'claude-sonnet-4-6' },
      }),
      prisma.subscription.update({ where: { userId }, data: { docsUsedThisMonth: { increment: 1 } } }),
    ]);

    return { ...doc, content, status: 'COMPLETED' };
  } catch (err) {
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'FAILED' } });
    logger.error('Document generation failed:', err.message);
    // Never expose API credit/billing details
    if (err.message?.toLowerCase().includes('credit') || err.message?.toLowerCase().includes('billing')) {
      throw new AppError('Document generation is temporarily unavailable. Please try again shortly or contact support@corverxis.com.', 503);
    }
    throw new AppError('Document generation failed. Please try again.', 503);
  }
}

async function listByUser(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, title: true, documentType: true, jurisdiction: true, status: true, createdAt: true, tokenCount: true },
    }),
    prisma.document.count({ where: { userId, deletedAt: null } }),
  ]);
  return { documents, total, page, limit, pages: Math.ceil(total / limit) };
}

async function getById(id, userId) {
  const doc = await prisma.document.findFirst({ where: { id, userId, deletedAt: null } });
  if (!doc) throw new AppError('Document not found.', 404);
  return doc;
}

async function softDelete(id, userId) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw new AppError('Document not found.', 404);
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
}

function buildPrompt({ documentType, jurisdiction, product, indication }) {
  return `You are an expert regulatory affairs specialist. Generate a professional, complete ${documentType} document for submission to ${jurisdiction}.

Product: ${product || 'Not specified'}
${indication ? `Indication/Use: ${indication}` : ''}

Requirements:
- Follow all applicable ${jurisdiction} guidelines and formatting requirements
- Include all required sections with appropriate headers
- Use professional regulatory language throughout
- Include relevant references to applicable regulations and standards
- Structure content for direct use in regulatory submission

Generate the complete document now:`;
}

module.exports = { generate, listByUser, getById, softDelete };
