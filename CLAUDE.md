# Sentinel

Session hijack detection app built with Next.js 16, Auth.js v5, FingerprintJS, Prisma 7, and Claude AI.

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build
- `npm run test:run` — Run tests once (Vitest)
- `npm test` — Run tests in watch mode
- `npx tsc --noEmit` — Type-check without emitting
- `npm run lint` — ESLint (CI runs typecheck, lint, tests, and build)
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
│   │   ├── sessions/          # Session monitoring page (polls while visible)
│   │   └── account/           # Account + detection settings
│   └── api/
│       ├── session/record/    # POST: fingerprint ingest + detection + Claude
│       ├── fingerprint/health/ # GET: Fingerprint Server API config check
│       └── cron/fingerprint-keepalive/ # Daily Vercel Cron (vercel.json), CRON_SECRET-gated
├── components/                # Client components (CartDrawer, SessionTable, etc.)
├── lib/
│   ├── auth.ts                # Auth.js config (Google OAuth, database sessions)
│   ├── db.ts                  # Prisma singleton with PrismaPg adapter
│   ├── detection.ts           # computeSimilarity() + runDetection()
│   ├── claude.ts              # analyzeDetectionEvent() with structured outputs
│   ├── fingerprint-server.ts  # Server-side verification via Fingerprint's API
│   ├── settings.ts            # Shared constants (storage keys, models, thresholds)
│   └── use-browser-storage.ts # useSyncExternalStore hooks over local/sessionStorage
├── proxy.ts                   # Sets auth_session=anonymous cookie on all routes
└── test/setup.ts              # Vitest setup file
```

## Key Patterns

- **Cookie:** Auth.js session cookie is named `auth_session` (not the default). Middleware ensures every visitor has one (set to `"anonymous"` for guests).
- **Detection pipeline:** Fingerprint POST → `runDetection()` (sync, in transaction) → `after()` → `analyzeDetectionEvent()` (async Claude call). The response returns immediately; Claude runs in the background.
- **Similarity scoring:** `computeSimilarity()` compares OS, browser, screenRes, timezone. Each field is 0.25 weight. Both-null = match, one-null = inconclusive.
- **Flagging threshold:** `confidenceScore >= 70` → FLAGGED, otherwise CLEAR.
- **Guest browsing:** Guests can view products. Cart, fingerprinting, sessions, and account require auth.
- **Auth checks:** Gate on `session?.user?.id`, never on `session` alone — Auth.js can return a populated object that carries an error.
- **Browser storage in components:** Read through `useStorageValue` / `useFlagThreshold` and write through `writeStorage` (`src/lib/use-browser-storage.ts`), not by copying storage into state in a mount effect — that trips `react-hooks/set-state-in-effect`.
- **Modals:** Use a native `<dialog>` opened with `showModal()` (see `CartDrawer`, `LoginModal`) so focus trapping, Escape, and the inert background come from the browser.

## Environment Variables

See `.env.local.example` for full documentation. Key ones:

- `DATABASE_URL` — Neon PostgreSQL (pooled)
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Auth.js + Google OAuth
- `NEXT_PUBLIC_FINGERPRINT_API_KEY` — FingerprintJS Pro (optional, OSS is default)
- `ANTHROPIC_API_KEY` — Claude API key
- `CRON_SECRET` — Bearer token Vercel Cron sends to `/api/cron/*`; those routes refuse everything without it
- `NEXT_PUBLIC_MODEL_PICKER_ENABLED` — Set `"true"` to enable model selector on profile page

## Testing

Vitest with jsdom. Tests use `vitest-mock-extended` for Prisma mocks (`src/lib/__mocks__/db.ts`). The `after()` function from `next/server` must be mocked in route tests.

Test files live next to source in `__tests__/` directories.

## Style

- Tailwind CSS v4 (no tailwind.config — uses CSS-based config)
- Design direction is **Aurora Flat** (`src/app/globals.css`): Plus Jakarta Sans, a lavender-tinted gray scale (redefined in `@theme`, so plain `gray-*` utilities carry it), 16px card radius, pill-shaped buttons, one neutral shadow. No gradients, glow, blur, or dark mode. Violet is the only accent; red/amber/emerald are status colors only.
- The site header is an ink band (`bg-gray-900`, `data-surface="ink"`), the one dark surface in the UI. On it: white wordmark, outlined `white/25` pills, a white "Sign in" pill as the single primary action, and a light-violet focus outline (globals.css). The account dropdown stays a white panel; it opens on hover for mouse/trackpad users (80ms delay, 220ms close grace), where clicking the button only ever opens or pins it; touch toggles on tap. It lists every page (Products, Sessions, Account) plus Sign out.
- Header nav (`NavLinks`): the logo is home (/products); **Products** and **Sessions** (signed-in only) are section links named after their page titles, always real links, marked `aria-current` inside their section, and icon-only on phones (names kept for screen readers). Sessions shows an amber `WarningIcon` when any live session is flagged (`countFlaggedSessions` in `src/lib/flagged.ts`, same rule as the /sessions "Flagged" stat).
- Logo has two tiers: the plain flat violet shield (`src/app/icon.svg`) for the favicon and anything under ~24px, and `SentinelMark` (`src/components/SentinelMark.tsx`, violet gradient + white iris scan) at 32px and up. The logo is the one allowed gradient.
- Minimal components, no component library
- Server components by default, `"use client"` only when needed
- Emojis in UI only where explicitly added (product images, nav branding)
