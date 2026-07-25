# Backlog

## Next

### New README screenshots

The two screenshots at the top of the README predate the July 2026 UI work and
show interface that no longer exists. Both need retaking.

What changed since they were captured:

- `/dashboard` is now `/sessions`, and `/profile` is now `/account`
- Session monitoring gained summary stat cards, risk-ordered rows, a "This
  device" chip, a confidence meter, and an ANALYZING state for pending analysis
- The account page was rebuilt: single column, session stat strip, settings as
  label/control rows with info tips and segmented toggles
- Nav dropped the Sessions link; sign out moved into an account dropdown
- The fingerprint toast gained the Fingerprint glyph and orange/outline badges

Both existing images are hosted as GitHub user-attachment URLs, so replacing
them means uploading new ones and swapping the `src` values in `README.md`
(currently lines 12–13).

Worth capturing while running the hijack walkthrough end to end, since that
produces a genuine FLAGGED row with real Claude reasoning — one shot of a
detected hijack and one of a false positive, matching the current alt text.

## Ideas

- Point the account page's "Verification" stat at `/api/fingerprint/health`
  instead of a bare key-exists check, so it can't report "Server-side" while
  every lookup is failing. Needs light caching.
- Redirects from `/dashboard` and `/profile` to the renamed routes, if the old
  URLs were ever shared.
- Per-user server-side detection settings. Threshold, model, and fingerprint
  mode currently live in localStorage, so they are per-browser rather than
  per-account.
