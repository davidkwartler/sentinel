# Backlog

Reopened 2026-07-28 from a UI/UX pass over the running app. The previous
entries all shipped and were archived on branch `backlog/all-items`; nothing
below is a regression of those.

These are ordered by what each one does for the demo, not by effort. The first
two change what a reviewer actually sees; the rest are correctness and polish.

## Next

### The hijack simulation is gated behind a README

The empty state at `src/components/SessionTable.tsx:112` tells the reader to go
find the README, copy their `auth_session` cookie out of devtools by hand, open
a second browser, and paste it in. That is the one moment the entire application
exists to produce, and it is sitting behind a manual multi-step chore performed
in another tool.

The practical consequence is that most people evaluating this repo never see
detection fire. They read that it works. A demo whose central claim is only ever
asserted is doing the same thing the analysis pipeline is built to avoid.

Proposal: a "Simulate hijack" affordance on the sessions page that copies the
current session cookie to the clipboard and shows the two remaining steps
inline. No new attack surface — it exposes the user's own cookie to the user,
which devtools already does, and it should be gated to the signed-in session
only. The win is converting a README instruction into something that happens
on screen in about fifteen seconds.

Worth deciding at implementation time whether this ships in production or stays
behind the same kind of build flag as the model and threshold pickers.

### A flagged session has no action attached to it

There is no revoke, terminate, or sign-out-elsewhere anywhere in the codebase —
`grep -ri revoke src/` returns nothing. The dashboard detects a hijack, scores
it, explains its reasoning, and then offers the user nothing to do about it. The
story stops one step short of where a security product's story ends.

Adding "Revoke session" to a flagged row completes that loop, and it makes the
session list a control surface rather than a readout.

It also settles a palette question that came up separately. Red currently means
one thing in this app — flagged, hijack suspected (`SessionTable.tsx:803`,
`:468`, `:495`). Revoke is the first genuinely destructive, genuinely
irreversible control in the UI, so it is the one place red is earned. That is
the reason sign out stays neutral: it is reversible by signing back in, and
spending the alarm colour on it would dull the signal the dashboard exists to
raise.

### Polling runs unconditionally, including on a hidden tab

`src/app/(shop)/sessions/PollingRefresher.tsx:10` calls `router.refresh()` on a
fixed 8-second interval with no conditions. That is a full server round trip
with a database query attached, every 8 seconds, for as long as the tab exists —
whether or not anything is happening and whether or not anyone is looking at it.

Two changes, both small:

- Pause while `document.hidden`. A backgrounded tab cannot show a result.
- Scale the interval to whether work is in flight. The 8-second cadence only
  earns its cost while a detection event is `PENDING` and Claude is running.
  With nothing pending, something like 30 seconds is indistinguishable to the
  user and roughly a quarter of the requests.

`docs/fingerprint-enrichment.md` already rejects a live-refetch details view
partly on per-view API cost, so this is applying a constraint the project has
argued for elsewhere.

### No route-level loading, error, or not-found states

`find src/app -name "loading.tsx" -o -name "error.tsx" -o -name "not-found.tsx"`
returns nothing. Three gaps follow from that:

- Navigating to `/sessions` holds the previous page until the server responds,
  with no indication anything was clicked. A skeleton for the session table is
  the highest-value one, since that route does the most server work.
- `/products/[id]` with an unknown id has no designed 404.
- An unhandled render error anywhere takes out the segment with the framework
  default rather than anything of ours.

### `ANALYZING` does not look like it is doing anything

The status pill at `src/components/SessionTable.tsx:804` is static amber while
Claude is mid-analysis. A badge that reads ANALYZING and never moves is
indistinguishable from one that is stuck, and the row can sit there for several
seconds.

An elapsed counter, or motion on the row, makes the asynchronous pipeline
legible — which is worth doing precisely because that pipeline is the part of
the architecture the project wants to show off. Whatever is used should respect
`prefers-reduced-motion`, as the footer reveal already does.

## Done

Nothing since this file was reopened. Entries that shipped before it was deleted
are on branch `backlog/all-items`.

## Not doing

- Redirects from `/dashboard` and `/profile` — the old URLs were never shared.
- Per-user server-side detection settings. Per-browser via localStorage is
  fine for a demo, and it avoids a schema change.
- Red styling on sign out. Considered and rejected: red is the flagged/hijack
  status colour throughout this app, and sign out is reversible. See the revoke
  entry above for where red belongs instead.
- A tinted tray behind the sign out row. Tried and reverted — the existing rule
  plus the lighter text already carry the separation, and a third cue on a
  four-item menu was more treatment than the problem needed.
