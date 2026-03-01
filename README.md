# Sentinel

> Session hijack detection powered by FingerprintJS Pro and Claude AI.

**Live demo:** https://sentinel.davidkwartler.com

Sentinel is a Next.js application that detects when a stolen session cookie is used from a
different device. When a fingerprint mismatch is detected, Claude analyzes the evidence and
assigns a confidence score. Flagged sessions appear on the security dashboard with Claude's
full reasoning.

## Architecture

```
Browser (Device A)
    | Google OAuth -> auth_session cookie (HttpOnly, SameSite=Lax)
    | Page load -> FingerprintJS Pro -> visitorId
    +-> POST /api/session/record
            | Store Fingerprint (isOriginal=true for first fingerprint)
            | runDetection(): compare new visitorId vs original
            |   -> Mismatch -> computeSimilarity() -> DetectionEvent (PENDING)
            |                -> after() -> analyzeDetectionEvent() [async]
            |                              +-> Claude API -> {confidenceScore, reasoning}
            |                                  confidenceScore >= 70 -> FLAGGED
            |                                  confidenceScore <  70 -> CLEAR
            +-> /dashboard (polls 8s) -> SessionTable -> FLAGGED badge -> expandable reasoning
```

**Tech stack:** Next.js 16 · Auth.js v5 · FingerprintJS Pro · Prisma 7 · Neon PostgreSQL ·
Anthropic Claude · Vercel

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database (free tier works)
- A [Google Cloud Console](https://console.cloud.google.com) project with an OAuth 2.0 client
- A [FingerprintJS Pro](https://fingerprint.com) account (free trial available)
- An [Anthropic](https://console.anthropic.com) API key

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/davidkwartler/sentinel.git
cd sentinel
npm install
```

### 2. Configure environment variables

Copy the template and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` — every variable is documented in the file with links to where to get each
credential. See [`.env.local.example`](.env.local.example) for details.

### 3. Set up the database

Push the Prisma schema to your Neon database:

```bash
npx prisma db push
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google to verify the setup.

### 5. Google Cloud Console: add authorized redirect URIs

In Google Cloud Console -> APIs & Services -> Credentials -> your OAuth 2.0 Client:
- Add `http://localhost:3000/api/auth/callback/google` for local development
- Add `https://<your-production-domain>/api/auth/callback/google` for production

## Hijack Simulation Walkthrough

This walkthrough reproduces a session cookie theft and detection end-to-end.

**Prerequisites:** Two different browsers (e.g., Chrome and Firefox) and the app running.

### Step 1: Establish a session on Device A

1. Open **Browser A** (e.g., Chrome)
2. Navigate to the app and sign in with Google
3. You will land on `/products`
4. Open DevTools -> **Application** -> **Cookies** -> find `auth_session`
5. Copy the full cookie **Value** (a long alphanumeric string)

### Step 2: Simulate the attacker on Device B

1. Open **Browser B** (e.g., Firefox — must differ from Browser A to get a different fingerprint)
2. Navigate to the same app URL
3. Open DevTools -> **Storage** -> **Cookies** (Firefox) or **Application** -> **Cookies** (Chrome)
4. Create a new cookie:
   - Name: `auth_session`
   - Value: *(paste the value copied from Step 1)*
   - Domain: `localhost` (or your production domain)
   - Path: `/`
5. Navigate to `/products` in Browser B — **without signing in**

### Step 3: Observe detection

1. Browser B loads the products page using Browser A's session
2. FingerprintJS records Browser B's visitorId — different from Browser A's
3. The detection engine flags the mismatch and dispatches Claude asynchronously
4. Wait **10-15 seconds** for Claude to complete analysis
5. In **Browser A**, navigate to `/dashboard`
6. The dashboard shows the session with a red **FLAGGED** badge
7. Click the flagged row to expand Claude's reasoning transcript

> **FingerprintJS Pro note:** If the Pro account is inactive, the app falls back to OSS mode.
> To force OSS mode manually: open DevTools -> Console -> run `localStorage.setItem('fpMode', 'oss')` -> reload.
> In OSS mode, fingerprints are less stable but the detection pipeline still functions for demo purposes.

## Running Tests

```bash
npm run test:run
```

Tests cover: `computeSimilarity` edge cases, `runDetection` transaction logic (mocked DB),
and `POST /api/session/record` response shapes (401 auth guard, 400 validation, 200 duplicate).

## Deploying to Vercel

1. Push to GitHub
2. Import the repo in [Vercel Dashboard](https://vercel.com/new)
3. Add all environment variables (see `.env.local.example` for the full list)
4. **Do not** set `NEXTAUTH_URL` — Auth.js v5 infers it automatically on Vercel
5. Deploy — Vercel runs `npm install` which auto-generates the Prisma client via postinstall
6. After deploy, add the Vercel production URL to Google Cloud Console -> Authorized redirect URIs

## Project Structure

```
src/
├── app/
│   ├── (shop)/           # Auth-gated route group
│   │   ├── layout.tsx    # Shared nav + FingerprintReporter
│   │   ├── products/     # Product listing
│   │   ├── profile/      # User profile
│   │   └── dashboard/    # Security dashboard (SessionTable, PollingRefresher)
│   ├── api/
│   │   └── session/record/  # POST: fingerprint ingest + detection + Claude dispatch
│   └── login/            # Sign-in page
├── components/
│   ├── SessionTable.tsx   # Dashboard table with expandable FLAGGED rows
│   └── FingerprintReporter.tsx  # Client component: FingerprintJS capture + POST
└── lib/
    ├── auth.ts           # Auth.js v5 config (Google provider, database sessions)
    ├── db.ts             # Prisma singleton
    ├── detection.ts      # computeSimilarity() + runDetection()
    └── claude.ts         # analyzeDetectionEvent() with structured outputs
prisma/
└── schema.prisma         # User, Session, Fingerprint, DetectionEvent models
```
