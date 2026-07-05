// src/routes/oauth.js — OAuth2 (Google) with Passport
const router = require('express').Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { prisma } = require('../config/database');
const { generateTokens } = require('../services/tokenService');
const { auditLog } = require('../services/auditService');
const { logger } = require('../config/logger');

// ── Configure Google Strategy ─────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email'],
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from Google'), null);

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            fullName: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
            privacyPolicyAccepted: false, // Must accept on first load
            oauthAccounts: {
              create: {
                provider: 'GOOGLE',
                providerAccountId: profile.id,
                accessToken,
                refreshToken,
                profileData: profile._json,
              },
            },
          },
        });
        logger.info(`New OAuth user created: ${email} via Google`);
      } else {
        // Update or create OAuth account link
        await prisma.oAuthAccount.upsert({
          where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: profile.id } },
          update: { accessToken, refreshToken },
          create: {
            userId: user.id,
            provider: 'GOOGLE',
            providerAccountId: profile.id,
            accessToken,
            refreshToken,
            profileData: profile._json,
          },
        });
      }

      return done(null, user);
    } catch (err) {
      logger.error('OAuth Google strategy error:', err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) { done(err, null); }
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  accessType: 'offline',
  prompt: 'select_account',
}));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}?oauth_error=1` }),
  async (req, res) => {
    try {
      const tokens = await generateTokens(req.user, req.ip, req.headers['user-agent']);
      await auditLog({ action: 'OAUTH_LOGIN', userId: req.user.id, req, metadata: { provider: 'GOOGLE' } });
      // Redirect to frontend with tokens in query (frontend stores in memory/cookie)
      const params = new URLSearchParams({
        access_token:  tokens.accessToken,
        refresh_token: tokens.refreshToken,
        oauth: '1',
      });
      res.redirect(`${process.env.FRONTEND_URL}?${params.toString()}`);
    } catch (err) {
      logger.error('OAuth callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL}?oauth_error=1`);
    }
  }
);

module.exports = router;
