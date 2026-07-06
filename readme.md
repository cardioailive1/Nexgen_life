# NexGenLife
### AI Regulatory Document Platform — Production Fullstack

**By Corverxis Technologies Ltd**  
🌐 https://nesgenlife.studio  
🏢 https://corverxis.com  
📧 support@corverxis.com

---

## Overview

NexGenLife is a production-ready fullstack Node.js + Express application serving the NexGenLife AI regulatory document platform. The frontend (`public/index.html`) is a fully dynamic single-page app wired entirely to this Express backend — no Supabase SDK, no direct Anthropic API calls from the browser, no hardcoded keys anywhere on the client.

All API keys (Anthropic, Stripe, SMTP) live server-side only. The frontend communicates exclusively through authenticated REST endpoints using JWT Bearer tokens with automatic refresh.

Designed to deploy on **Render.com** with a single command.

---

## What Changed — Frontend is Now Fully Dynamic

The frontend was migrated from static (direct API calls) to dynamic (all calls via this backend):

| Feature | Before | After |
|---|---|---|
| AI document generation | Direct `api.anthropic.com` call from browser | `POST /api/documents/generate` — key server-side only |
| Authentication | Supabase SDK in browser | `POST /auth/login` / `POST /auth/register` → JWT tokens |
| Session persistence | Supabase localStorage session | Access token (15m) + refresh token (7d), auto-refreshed |
| Password reset | Supabase `resetPasswordForEmail` | `POST /auth/forgot-password` + `POST /auth/reset-password` |
| Stripe checkout | Direct `buy.stripe.com` link | `POST /api/subscriptions/checkout` → Stripe session URL |
| Enterprise form | Formspree (3rd party) | `POST /api/enterprise/inquiry` → DB + email |
| Post-payment unlock | Client-side metadata update (spoofable) | Server reads Stripe webhook-updated DB record |

**Security result:** No API key is ever exposed in the browser source. Payment confirmation is server-side via Stripe webhook — cannot be spoofed by URL manipulation.

---

## Updating the Frontend

When `nexgenlife.html` changes, only one file needs updating in the repo:

```bash
cp nexgenlife.html public/index.html
git add public/index.html
git commit -m "Update frontend"
git push
# Render auto-redeploys
```

No backend files need to change for frontend-only updates.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | PostgreSQL 16 (Prisma ORM) |
| Auth | JWT (15m) + Refresh tokens (7d) + Google OAuth2 (Passport.js) |
| Payments | Stripe (Checkout Sessions, Webhooks, Customer Portal) |
| AI | Anthropic Claude API (server-side only) |
| Email | Nodemailer via Resend SMTP |
| Security | Helmet, CORS, bcrypt (rounds=12), AES-256 MFA, TOTP RFC 6238 |
| Logging | Winston + Daily rotating files (7-year SOC2 retention) |
| Hosting | Render.com |

---

## Project Structure

```
nexgenlife-render/
├── src/
│   ├── server.js                   # Express entry point — security, middleware, routes
│   ├── config/
│   │   ├── database.js             # Prisma client singleton + slow query logging
│   │   └── logger.js               # Winston SOC2-compliant daily rotating logger
│   ├── routes/
│   │   ├── auth.js                 # Register, login, refresh, logout, verify email, reset password
│   │   ├── oauth.js                # Google OAuth2 via Passport.js
│   │   ├── users.js                # Profile get/update, password change
│   │   ├── documents.js            # Generate (Anthropic), list, get, soft-delete
│   │   ├── subscriptions.js        # Stripe checkout session + billing portal
│   │   ├── webhooks.js             # Stripe webhook — payment/subscription lifecycle
│   │   ├── enterprise.js           # Enterprise inquiry form → DB + email to support
│   │   ├── compliance.js           # GDPR data export/deletion, consent, SOC2 audit log
│   │   └── health.js               # /health — DB ping + status for Render monitoring
│   ├── services/
│   │   ├── authService.js          # Register, login, token refresh, password reset
│   │   ├── tokenService.js         # JWT access token + opaque refresh token generation
│   │   ├── documentService.js      # Anthropic API wrapper + monthly usage counter
│   │   ├── subscriptionService.js  # Stripe checkout/portal session creation
│   │   ├── auditService.js         # SOC2 CC7.2 — writes audit log on every action
│   │   ├── emailService.js         # Nodemailer transactional email (verify, reset, alerts)
│   │   └── mfaService.js           # TOTP RFC 6238 — AES-256 encrypted secret storage
│   ├── middleware/
│   │   ├── authenticate.js         # JWT Bearer guard — validates + attaches req.user
│   │   ├── rateLimiter.js          # Global (100/15m) + auth-specific (20/15m) limits
│   │   ├── errorHandler.js         # Central handler — no stack traces or internals in prod
│   │   ├── validate.js             # express-validator result checker
│   │   ├── requireRole.js          # RBAC — USER / ADMIN / SUPPORT
│   │   ├── requireSubscription.js  # Blocks unpaid users from document routes
│   │   ├── requestId.js            # X-Request-ID header for distributed tracing
│   │   └── audit.js                # Injects req.clientIp for audit service
│   └── utils/
│       └── AppError.js             # Typed operational error (statusCode, code, isOperational)
├── prisma/
│   ├── schema.prisma               # 12 models: User, Session, OAuthAccount, Subscription,
│   │                               # Payment, Document, ApiKey, AuditLog, DataExport,
│   │                               # EnterpriseInquiry, PolicyVersion, PasswordReset
│   └── seed.js                     # Seeds policy versions + optional admin user
├── public/
│   └── index.html                  # NexGenLife frontend — dynamic SPA, calls this backend
├── render.yaml                     # Render.com Blueprint — one-click web service + Postgres
├── .env.example                    # All 25 environment variables documented with descriptions
├── DEPLOYMENT.md                   # Full step-by-step Render.com + Stripe + OAuth2 guide
└── README.md                       # This file
```

---

## Quick Start (Local Development)

```bash
# 1. Unzip / clone and enter the directory
cd nexgenlife-render

# 2. Install dependencies
npm install

# 3. Copy environment template and fill in real values
cp .env.example .env
# Minimum required for local dev:
# DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ANTHROPIC_API_KEY

# 4. Create and migrate the database
npx prisma migrate dev --name init

# 5. Seed initial data (policy versions + optional admin)
node prisma/seed.js

# 6. Start the dev server
npm run dev
# → http://localhost:3000
# → Frontend served at http://localhost:3000/
# → API at http://localhost:3000/api/...
```

---

## Deploy to Render.com

### One-click Blueprint (recommended)
1. Push this folder to a GitHub or GitLab repository
2. Go to https://dashboard.render.com → **New** → **Blueprint**
3. Connect your repository — Render auto-detects `render.yaml`
4. Click **Apply** — provisions web service + PostgreSQL automatically
5. Add the 8 required env vars in the Render dashboard (see below)

### Manual
1. Render → New → Web Service → connect repo
2. **Build command:** `npm install && npx prisma generate && npx prisma migrate deploy`
3. **Start command:** `node src/server.js`
4. **Health check path:** `/health`

See `DEPLOYMENT.md` for Stripe webhook setup, Google OAuth2 configuration, and the full env var reference.

---

## Environment Variables

Auto-generated by Render Blueprint (no action needed):

```
DATABASE_URL         JWT_SECRET           JWT_REFRESH_SECRET
COOKIE_SECRET        ENCRYPTION_KEY
```

Must be set manually in Render dashboard:

```
ANTHROPIC_API_KEY              # sk-ant-...
STRIPE_SECRET_KEY              # sk_live_...
STRIPE_WEBHOOK_SECRET          # whsec_...
STRIPE_STARTER_PRICE_ID        # price_... (from Stripe Product catalog)
STRIPE_PROFESSIONAL_PRICE_ID   # price_...
GOOGLE_CLIENT_ID               # From Google Cloud Console
GOOGLE_CLIENT_SECRET
SMTP_PASS                      # Resend API key (re_...)
```

See `.env.example` for all 25 variables with descriptions.

---

## Compliance

| Standard | Implementation |
|---|---|
| **SOC2 Type II** | Audit log on every auth/billing/document action (CC7.2), rate limiting (CC6.1), RBAC, session invalidation on password change, request tracing |
| **GDPR / UK GDPR** | Data export endpoint (Art.20), right to erasure (Art.17), consent timestamp recording, privacy policy versioning, 7-year log retention |
| **ISO 27001** | Helmet security headers, HSTS preload, strict CORS, input validation on all endpoints, bcrypt rounds=12, AES-256-CBC MFA secret encryption |
| **OAuth2** | Google OAuth2 via Passport.js — implicit flow, token refresh, profile linking, PKCE-ready |
| **PCI-DSS** | Zero card data stored — all payment scope delegated to Stripe; webhook signature verification |
| **HIPAA-adjacent** | Audit trail, role-based access, minimum data collection, encryption at rest and in transit |

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account — stores consent timestamp |
| POST | `/auth/login` | — | Sign in → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | — | Exchange refresh token for new access token |
| POST | `/auth/logout` | ✓ | Invalidates session in DB |
| POST | `/auth/forgot-password` | — | Sends reset email (silent on unknown email) |
| POST | `/auth/reset-password` | — | Reset password with token from email |
| GET | `/auth/google` | — | Initiate Google OAuth2 flow |
| GET | `/auth/google/callback` | — | OAuth2 callback — redirects to frontend with tokens |
| GET | `/auth/me` | ✓ | Current user from token |
| GET | `/api/users/me` | ✓ | Full profile + subscription details |
| PATCH | `/api/users/me` | ✓ | Update name, org, job title, country |
| POST | `/api/users/change-password` | ✓ | Change password (requires current password) |
| POST | `/api/documents/generate` | ✓ Sub | Generate document via Anthropic — checks monthly limit |
| GET | `/api/documents` | ✓ Sub | Paginated document list |
| GET | `/api/documents/:id` | ✓ Sub | Single document |
| DELETE | `/api/documents/:id` | ✓ Sub | Soft delete |
| GET | `/api/subscriptions` | ✓ | Current subscription status |
| POST | `/api/subscriptions/checkout` | ✓ | Create Stripe checkout session → returns `{ url }` |
| POST | `/api/subscriptions/portal` | ✓ | Create Stripe billing portal session |
| POST | `/api/enterprise/inquiry` | — | Enterprise contact → DB + email to support@corverxis.com |
| POST | `/api/compliance/data-export` | ✓ | GDPR Art.20 data export |
| POST | `/api/compliance/deletion-request` | ✓ | GDPR Art.17 erasure request |
| POST | `/api/compliance/consent` | ✓ | Record privacy policy consent |
| GET | `/api/compliance/audit-logs` | Admin | SOC2 audit log (paginated) |
| POST | `/webhooks/stripe` | — | Stripe event handler (signature verified) |
| GET | `/health` | — | DB ping + service status for Render |

---

## Subscription Plans

| Plan | Monthly Limit | Stripe Price ID env var |
|---|---|---|
| Starter | 10 documents/month | `STRIPE_STARTER_PRICE_ID` |
| Professional | Unlimited | `STRIPE_PROFESSIONAL_PRICE_ID` |
| Enterprise | Sales-led → support@corverxis.com | No IAP |

---

## Support

**Corverxis Technologies Ltd**  
📧 support@corverxis.com  
🌐 https://nesgenlife.studio  
🏢 https://corverxis.comread
