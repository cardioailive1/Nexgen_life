// prisma/seed.js — Seed initial policy versions and admin user
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NexGenLife database...');

  // Seed policy versions
  await prisma.policyVersion.upsert({
    where: { type_version: { type: 'privacy_policy', version: '1.0.0' } },
    update: {},
    create: {
      type: 'privacy_policy',
      version: '1.0.0',
      content: 'NexGenLife Privacy Policy v1.0.0 — See nexgenlife.studio for full text.',
      effectiveAt: new Date('2026-01-01'),
    },
  });

  await prisma.policyVersion.upsert({
    where: { type_version: { type: 'terms_of_service', version: '1.0.0' } },
    update: {},
    create: {
      type: 'terms_of_service',
      version: '1.0.0',
      content: 'NexGenLife Terms of Service v1.0.0 — See nexgenlife.studio for full text.',
      effectiveAt: new Date('2026-01-01'),
    },
  });

  console.log('✅ Policy versions seeded');

  // Seed admin user if ADMIN_EMAIL is set
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const admin = await prisma.user.upsert({
      where: { email: process.env.ADMIN_EMAIL },
      update: {},
      create: {
        email: process.env.ADMIN_EMAIL,
        passwordHash,
        fullName: 'NexGenLife Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        privacyPolicyAccepted: true,
        privacyPolicyVersion: '1.0.0',
        privacyAcceptedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    });
    console.log('✅ Admin user seeded:', admin.email);
  }

  console.log('🎉 Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
