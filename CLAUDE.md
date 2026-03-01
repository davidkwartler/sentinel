# Sentinel

Session hijack detection app built with Next.js 16, Auth.js v5, FingerprintJS, Prisma 7, and Claude AI.

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build
- `npm run test:run` — Run tests once (Vitest)
- `npm test` — Run tests in watch mode
- `npx tsc --noEmit` — Type-check without emitting
- `npm run lint` — ESLint
- `npx prisma db push` — Push schema to database
- `npx prisma generate` — Regenerate Prisma client (also runs on `npm install` via postinstall)

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page (redirects if already authed)
│   ├── (shop)/                # Auth-aware route group (guests can browse)
│   │   ├── layout.tsx         # Nav + FingerprintReporter (auth-only)
│   │   ├── products/          # Product listing + detail pages
│   │   ├── dashboard/         # Session Monitoring page
│   │   └── profile/           # Account + settings
│   └── api/session/record/    # POST: fingerprint ingest + detection + Claude
├── components/                # Client components (CartDrawer, SessionTable, etc.)
├── lib/
│   ├── auth.ts                # Auth.js config (Google OAuth, database sessions)
│   ├── db.ts                  # Prisma singleton with PrismaPg adapter
│   ├── detection.ts           # computeSimilarity() + runDetection()
│   └── claude.ts              # analyzeDetectionEvent() with structured outputs
├── middleware.ts               # Sets auth_session=anonymous cookie on all routes
└── test/setup.ts              # Vitest setup file
```

## Key Patterns

- **Cookie:** Auth.js session cookie is named `auth_session` (not the default). Middleware ensures every visitor has one (set to `"anonymous"` for guests).
- **Detection pipeline:** Fingerprint POST → `runDetection()` (sync, in transaction) → `after()` → `analyzeDetectionEvent()` (async Claude call). The response returns immediately; Claude runs in the background.
- **Similarity scoring:** `computeSimilarity()` compares OS, browser, screenRes, timezone. Each field is 0.25 weight. Both-null = match, one-null = inconclusive.
- **Flagging threshold:** `confidenceScore >= 70` → FLAGGED, otherwise CLEAR.
- **Guest browsing:** Guests can view products. Cart, fingerprinting, dashboard, and profile require auth.

## Environment Variables

See `.env.local.example` for full documentation. Key ones:

- `DATABASE_URL` — Neon PostgreSQL (pooled)
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Auth.js + Google OAuth
- `NEXT_PUBLIC_FINGERPRINT_API_KEY` — FingerprintJS Pro (optional, OSS is default)
- `ANTHROPIC_API_KEY` — Claude API key
- `NEXT_PUBLIC_MODEL_PICKER_ENABLED` — Set `"true"` to enable model selector on profile page

## Testing

Vitest with jsdom. Tests use `vitest-mock-extended` for Prisma mocks (`src/lib/__mocks__/db.ts`). The `after()` function from `next/server` must be mocked in route tests.

Test files live next to source in `__tests__/` directories.

## Style

- Tailwind CSS v4 (no tailwind.config — uses CSS-based config)
- Minimal components, no component library
- Server components by default, `"use client"` only when needed
- Emojis in UI only where explicitly added (product images, nav branding)
