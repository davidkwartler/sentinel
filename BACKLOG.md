# Backlog

Groomed 2026-10-20. Open work up top, ordered by what it does for the demo,
then a changelog of everything shipped. Detailed write-ups of the July
batches live on branch `backlog/all-items`.

## Next

### Simulate a hijack without the README

The sessions page's empty state sends people to the README to copy their
`auth_session` cookie out of devtools and paste it into a second browser, so
most visitors never see detection fire. Add a "Simulate hijack" control that
copies the signed-in user's own cookie and shows the remaining steps inline.
Decide at build time whether it ships in production or sits behind a build
flag like the model and threshold pickers.

### Act on a flagged session

Detection flags, scores and explains a hijack, then offers nothing to do about
it. Add "Revoke session" to flagged rows so the session list is a control
surface, not a readout. It's the one destructive, irreversible action in the
UI, so it's where red belongs; sign out stays neutral because it's reversible.

### Route-level loading, error and not-found states

There's no `loading.tsx`, `error.tsx` or `not-found.tsx` anywhere. In order of
value: a skeleton for `/sessions` (the heaviest server render), a designed 404
for unknown `/products/[id]`, and an error boundary of our own instead of the
framework default.

### Make `ANALYZING` look alive

The amber ANALYZING pill is static while Claude works, so a slow analysis looks
stuck. An elapsed counter or subtle motion on the row makes the async pipeline
visible, respecting `prefers-reduced-motion`.

## Not doing

- Redirects from `/dashboard` and `/profile`: the old URLs were never shared.
- Per-user server-side detection settings: per-browser localStorage is fine for
  a demo and avoids a schema change.

---

## Changelog

### 2026-10-20 — Dependency and Scorecard cleanup

- Dev tooling advisories cleared: vitest 4.1.12 (with vite 7.3.7 and
  @vitest/mocker), undici, js-yaml, picomatch, flatted, browserslist,
  brace-expansion, esbuild, @babel/core, @humanfs/node. Left: the `braces`
  chain under `eslint-config-next`, which has no patched release
- fast-check property tests: `computeSimilarity` (range, symmetry, identity,
  case and whitespace) and fuzzed bodies against the record route, which must
  always get a clean 400 and write nothing
- `SECURITY.md` states disclosure timelines; Dependabot groups security
  updates into one PR per ecosystem
- Majors: @vercel/speed-insights 2, jsdom 30, @vitejs/plugin-react 6 (vite
  8) and vitest-mock-extended 5, with no code changes

### 2026-10-20 — CI and security pipeline

- CI on Node 22 as two parallel jobs: typecheck, lint and a production
  `npm audit` gate; Vitest and build. Superseded PR runs cancel
- Dependency review, zizmor and OpenSSF Scorecard workflows; CodeQL stays on
  GitHub default setup, which scans the TypeScript and the workflows
- Dependabot for npm and actions, grouped weekly with a 7-day cooldown
- Every action SHA-pinned, read-only tokens by default, no persisted checkout
  credentials. `SECURITY.md` added
- The audit gate's first run cleared 5 high advisories with non-breaking
  bumps: Next 16.4.2, Prisma 7.10.1, source-map-js, deepmerge-ts

### 2026-09-28 — Aurora Flat restyle, hardening, keepalive cron

- Restyled as Aurora Flat: Plus Jakarta Sans, lavender-tinted grays, violet
  as the only accent, an ink-band header, and the iris-scan `SentinelMark`
  logo (flat shield for the favicon)
- Header nav: Products and Sessions as section links (icon-only on phones),
  an amber warning on Sessions when any live session is flagged, and every
  page in the account menu
- Security: critical-advisory upgrades (Next, Auth.js, Prisma), auth gated
  on `session?.user?.id`, baseline security headers, and a record route that
  rejects malformed JSON and caps writes per user per hour. Claude output is
  checked (end of turn, score clamped to 0-100) before it's trusted
- Speed: database indexes for the session and detection queries; polling
  pauses on a hidden tab and runs every 8s only while an event is pending
- Accessibility: cart and login are native `<dialog>`s (focus trap, Escape,
  focus return), the account menu has full keyboard support, and the
  fingerprint toast and session stats are live regions
- Daily Vercel Cron, gated by `CRON_SECRET`, keeps the Fingerprint workspace
  active

### 2026-07-28 — Using the Fingerprint data we pay for

- Verified identification events are kept, not just five of their fields:
  IP geolocation, ASN and datacenter now persist, so re-analysis sees the
  same evidence and impossible travel uses server-observed coordinates
- The Tor exit node signal reaches the prompt, read two-sided: switching to
  Tor mid-session is evidence, Tor throughout is a privacy-minded user
- The prompt no longer explains hijacks away as incognito browsing
- Footer credit links back to davidkwartler.com

### 2026-07-27 — Detection gaps and hardening

- Fingerprint verification is decided server-side, never from the
  client-supplied mode, and a downgrade from verified to unverifiable is a
  signal for Claude
- Fingerprints and detection events keyed to the user, not the session, with
  a Detection history section for events whose session is gone
- A silent Pro-to-OSS fallback is surfaced; fingerprint components are
  validated by shape; the client flag threshold sits behind a build flag
- Fingerprint data enrichment spec (`docs/fingerprint-enrichment.md`)

### 2026-07-25 — Visual identity and mobile pass

- Violet shield logo, footer, and icons in place of emoji
- Mobile pass on product rows, footer and header; official Google mark and
  reworked sign-in copy
- Violet for interaction: focus rings, slider, selected segment

### 2026-07-24 — Detection pipeline and dashboard overhaul

- Sessions resolve by the presented cookie token; fingerprint ingest and
  detection run in one transaction
- Fingerprints verified server-side through the Fingerprint Server API, with
  a health-check endpoint
- Flag-threshold slider (minimum 20), an analysis-off mode, a calibrated
  system prompt and current Claude models in the picker
- Session monitoring dashboard overhauled; account page redesigned with
  segmented controls; routes renamed `/profile` → `/account` and
  `/dashboard` → `/sessions`

### 2026-05-02 — Pro by default

- FingerprintJS Pro is the default when an API key is set, with a mode badge
  in the UI

### 2026-02-28 — v1

- Next.js 16, Prisma 7 and Auth.js v5 foundation with an e-commerce demo
  shell, fingerprint capture, the detection engine (similarity scoring), async
  Claude analysis with structured outputs, and the security dashboard
- Anonymous `auth_session` cookie set in middleware to make the hijack demo
  reproducible
