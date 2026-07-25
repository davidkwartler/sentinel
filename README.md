# Sentinel

> Session hijack detection powered by FingerprintJS Pro and Claude AI.

**Live demo:** https://sentinel.davidkwartler.com

Sentinel is a Next.js application that detects when a stolen session cookie is used from a
different device. When a fingerprint mismatch is detected, Claude analyzes the evidence and
assigns a confidence score. Flagged sessions appear on the session monitoring page with
Claude's full reasoning.

<img width="1000" height="454" alt="Session hijack detected" src="https://github.com/user-attachments/assets/43a3a6eb-4661-4ec7-8f5d-be39b6086388" />
<img width="1000" height="411" alt="Session hijack false positive" src="https://github.com/user-attachments/assets/a00a124c-d524-4b48-99db-23a29f415861" />



## Architecture

```
Browser (Device A)
    | Google OAuth -> auth_session cookie (HttpOnly, SameSite=Lax)
    | Page load -> FingerprintJS Pro -> visitorId + requestId
    +-> POST /api/session/record
            | Fingerprint Server API: resolve requestId -> authoritative
            |   visitorId/IP/OS/browser + Smart Signals (overrides client claims)
            | Store Fingerprint (isOriginal=true for first fingerprint)
            | runDetection(): compare new visitorId vs original
            |   -> Mismatch -> computeSimilarity() -> DetectionEvent (PENDING)
            |                -> after() -> analyzeDetectionEvent() [async]
            |                              +-> Claude API -> {confidenceScore, reasoning}
            |                                  confidenceScore >= threshold (default 70) -> FLAGGED
            |                                  confidenceScore <  threshold -> CLEAR
            |                                  (analysis "Off" -> flag on mismatch alone)
            +-> /sessions (polls 8s) -> SessionTable -> FLAGGED badge -> expandable reasoning
```

**Tech stack:** Next.js 16 · Auth.js v5 · FingerprintJS Pro · Prisma 7 · Neon PostgreSQL ·
Anthropic Claude · Vercel

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database (free tier works)
- A [Google Cloud Console](https://console.cloud.google.com) project with an OAuth 2.0 client
- A [FingerprintJS Pro](https://fingerprint.com) account (free trial available) — you need
  both the Public API Key (browser) and the Secret API Key (server-side verification)
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
5. In **Browser A**, navigate to `/sessions`
6. The session monitoring page shows the session with a red **FLAGGED** badge
7. Click the flagged row to expand Claude's reasoning transcript

> **FingerprintJS Pro note:** The app defaults to Pro mode when
> `NEXT_PUBLIC_FINGERPRINT_API_KEY` is set, and falls back to OSS mode
> (open-source FingerprintJS) otherwise. You can switch modes at any time from
> `/account` -> **Fingerprint Mode**. In OSS mode, fingerprints are less stable
> but the detection pipeline still functions for demo purposes.

> **Server-side verification:** When `FINGERPRINT_SERVER_API_KEY` is set, the
> ingest route takes only the `requestId` from the browser and resolves it
> against Fingerprint's Server API, then uses the server-observed visitor ID,
> IP, OS, browser, and user agent instead of anything the client claimed about
> itself. This closes the replay hole — a client that lies about its components
> is overridden and logged. It also feeds Smart Signals (incognito, VPN, bot,
> tampering/anti-detect browser, request-ID replay, identification confidence)
> into the Claude prompt, which is what lets the model separate "incognito on
> the same laptop" from "cookie replayed from another machine" on evidence
> rather than inference.
>
> Without the key the app still runs, but fingerprint components are
> client-reported and unverified — fine for the demo, not for production. OSS
> mode always skips verification, since its `requestId` is a locally generated
> UUID with nothing to resolve against.
>
> **Plan tiers:** Identification (the authoritative visitorId, IP, OS, and
> browser) is available on every plan, so the replay protection above works
> regardless. Smart Signals are plan-gated — signals your plan doesn't include
> simply aren't sent to Claude, and the prompt instructs the model to treat a
> missing signal as unmeasured rather than as a negative result.
>
> To check verification in a running deployment, sign in and request
> `GET /api/fingerprint/health`. It probes the Server API and reports `ok`,
> `not_configured`, or an error code translated into plain English
> (`TokenNotFound`, `WrongRegion`, `SubscriptionNotActive`, …). It never
> returns the key.

## Running Tests

```bash
npm run test:run
```

Tests cover: `computeSimilarity` edge cases, `runDetection` transaction logic (mocked DB),
`POST /api/session/record` response shapes (401 auth guard, 400 validation, 200 duplicate),
and `verifyFingerprint` server-API behaviour (override, client-mismatch detection, stale
events, bot signals, fail-open on lookup errors).

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
│   ├── (shop)/           # Auth-aware route group (guests can browse; cart + fingerprinting require auth)
│   │   ├── layout.tsx    # Shared nav + FingerprintReporter
│   │   ├── products/     # Product listing
│   │   ├── account/      # Account settings (fingerprint mode, model, threshold)
│   │   └── sessions/     # Session monitoring (SessionTable, PollingRefresher)
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
    ├── fingerprint-server.ts  # Server API verification + Smart Signals
    ├── settings.ts       # Shared client/server constants (keys, models, threshold)
    └── claude.ts         # analyzeDetectionEvent() with structured outputs
prisma/
└── schema.prisma         # User, Session, Fingerprint, DetectionEvent models
```
