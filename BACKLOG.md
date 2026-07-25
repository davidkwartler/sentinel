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

## Done

- Unified page width — `/account` now uses the layout's `max-w-5xl` like
  `/sessions`, rather than its own narrower container.
- The account page's "Verification" stat now reflects a live probe of the
  Fingerprint Server API rather than the presence of a key.

## Not doing

- Redirects from `/dashboard` and `/profile` — the old URLs were never shared.
- Per-user server-side detection settings. Per-browser via localStorage is
  fine for a demo, and it avoids a schema change.
