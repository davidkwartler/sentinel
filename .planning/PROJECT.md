# Sentinel

## What This Is

Sentinel is a session hijack detection proof-of-concept built on top of a minimal e-commerce web application. It maps browser fingerprints (via FingerprintJS) to active session IDs, detects mismatches that indicate cookie theft, and uses Claude AI to evaluate the discrepancy metadata and return a confidence score. A security dashboard surfaces flagged sessions in real time.

## Core Value

The one thing that must work: when a stolen session cookie is used from a different device, Sentinel detects it, calls Claude for analysis, and flags the session with a confidence score on the dashboard.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can sign in via Google OAuth
- [ ] Session cookie (auth_session) is visible and transferable for simulation
- [ ] FingerprintJS records a unique fingerprint per device/browser on every authenticated request
- [ ] System maps each request to a {SessionID, FingerprintID, IP_Address, User_Agent} tuple
- [ ] System detects when a second distinct FingerprintID appears on an active SessionID
- [ ] Mismatch triggers a Claude API call with session metadata for hijack analysis
- [ ] Claude returns a structured confidence score (0–100) with reasoning
- [ ] Security dashboard lists all active sessions with associated fingerprints
- [ ] Dashboard flags sessions above a configurable confidence threshold
- [ ] E-commerce shell provides realistic authenticated pages (product browse, cart, checkout)
- [ ] App deploys to Vercel with secrets stored as Vercel environment variables

### Out of Scope

- Mobile native app — web-first, mobile is a future concern
- Real payment processing — cart/checkout is UI-only for demo purposes
- Multi-tenant / SaaS — single user namespace for PoC
- OAuth providers beyond Google — one provider is sufficient
- Automated remediation (session termination) — detection and flagging only for v1

## Context

- **Purpose**: Personal portfolio project demonstrating a security detection capability using GenAI
- **Simulation flow**: Device A logs in → FP_01 recorded. Attacker copies auth_session cookie from DevTools. Device B uses cookie → FP_02 recorded for same SessionID → mismatch triggers detection pipeline.
- **GenAI layer**: Claude analyzes OS, location, browser delta between fingerprints and returns a confidence score. The goal is minimizing false positives (e.g., same user on VPN vs. genuine hijack).
- **Deployment**: Vercel. All API keys (GOOGLE_CLIENT_ID/SECRET, FINGERPRINTJS_API_KEY, ANTHROPIC_API_KEY) stored as Vercel environment variables — never committed to git.
- **Credentials policy**: No placeholder keys. Implementation stubs must fail gracefully and document which env var is missing. Keys provided by user before functional testing.

## Constraints

- **Credentials**: No API keys in source code or .env committed to git — Vercel env vars only
- **FingerprintJS**: Must use the FingerprintJS Pro/JS SDK; the fingerprint must be hardware-level stable across page navigations
- **Claude API**: Detection logic calls Anthropic API directly (not via proxy); model should be configurable
- **Stack**: Must deploy on Vercel — serverless-compatible architecture required
- **Scope**: This is a PoC, not a hardened production system — security theater in the e-commerce shell is acceptable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| E-commerce shell (not booking) | More realistic session surface with cart/profile pages | — Pending |
| Google OAuth only | Sufficient for PoC; reduces auth complexity | — Pending |
| Claude for analysis (not rule-based) | Minimizes false positives vs. hard mismatch rules; showcases GenAI integration | — Pending |
| Vercel deployment | Public shareable URL for portfolio; native env var support | — Pending |

---
*Last updated: 2026-02-28 after initialization*
