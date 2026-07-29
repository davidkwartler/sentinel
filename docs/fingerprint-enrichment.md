# Fingerprint data enrichment

Sentinel resolves a full identification event from Fingerprint's Server API on
every Pro capture, reads five of its twenty-six products, and discards the rest
before the response leaves `verifyFingerprint()`. This spec covers keeping that
data, feeding the relevant parts to Claude, and exposing it in the UI.

## The problem

There are two separate losses, and they compound.

**Nothing is stored.** `verifyFingerprint()` returns a `VerifiedFingerprint`
carrying five scalar fields and seven signals. The event object it was derived
from is garbage-collected at the end of the request. The `Fingerprint` row keeps
`visitorId`, `ip`, `userAgent`, `os`, `browser`, `screenRes`, `timezone` — and
`screenRes` and `timezone` are client-reported, not from the API at all.

**The signals are never persisted either.** They are passed in memory from
`route.ts` to `analyzeDetectionEvent()` and then dropped. Nothing in the
database records that a fingerprint was flagged as a bot, or came through a VPN,
or arrived on a replayed request ID. The reasoning text Claude produces is the
only surviving trace, in prose, unqueryable.

Consequence: a details view built today would have nothing to render for any
existing fingerprint, and re-running analysis on a historical event would
silently analyze less evidence than the original run did.

**Twenty-one products are read by nothing.** The response carries `botd`,
`clonedApp`, `developerTools`, `emulator`, `factoryReset`, `frida`,
`highActivity`, `identification`, `incognito`, `ipBlocklist`, `ipInfo`,
`jailbroken`, `locationSpoofing`, `mitmAttack`, `privacySettings`, `proximity`,
`proxy`, `rawDeviceAttributes`, `remoteControl`, `rootApps`, `suspectScore`,
`tampering`, `tor`, `velocity`, `virtualMachine`, `vpn`. Sentinel consults
`identification`, `incognito`, `vpn`, `botd`, and `tampering`.

The system prompt tells Claude that bot detection, tampering, and request-ID
replay are strong evidence of active evasion. `tor`, `proxy`, `remoteControl`,
`developerTools`, `virtualMachine`, `locationSpoofing`, and `ipBlocklist` are in
the same response and never reach it. The model is asked to reason about evasion
with most of the evasion evidence withheld.

Within `identification` the same thing happens one level down: `ipLocation`,
`firstSeenAt`, `lastSeenAt`, `visitorFound`, `suspect`, and `linkedId` are all
dropped, as are `browserDetails.device`, `.osVersion`, and `.browserFullVersion`.

## What to add, and why these

Not "everything available" — the four below are the ones that change what the
app can conclude about a session hijack specifically.

### `ipLocation` — the largest single win

City, country, subdivisions, latitude/longitude, accuracy radius, timezone.

Today the demo's impossible-travel argument rests on the `timezone` string,
which the browser reports about itself and which this app now shape-validates
precisely because it is not trustworthy. Server-resolved geolocation moves that
argument from inference to evidence, and it is what makes the flagged-session
screenshot read as a real security product.

It also lets `computeSimilarity()` gain a geographic component that cannot be
forged by the client, and gives the prompt a distance rather than two timezone
names it has to reason about geographically on its own.

Note `accuracyRadius`: IP geolocation is coarse, and a same-city move can show
tens of kilometres of drift. Any distance threshold has to be stated against the
radius or it will produce false positives on ordinary ISP reassignment.

### `firstSeenAt` / `lastSeenAt` / `visitorFound`

Answers a question the app currently cannot ask: has Fingerprint seen this
device before, and for how long?

A session cookie appearing on a visitor Fingerprint has known for a year is a
very different event from the same cookie appearing on one first seen ninety
seconds ago. Right now both look identical — a visitor ID that does not match
the original. This is the cheapest large improvement to false-positive rate,
because the most common benign cause of a mismatch (a returning device whose
storage was cleared) still tends to carry history.

### `velocity`

`distinctIp`, `distinctCountry`, `distinctLinkedId`, `distinctVisitorIdByLinkedId`
over rolling windows.

Purpose-built for this problem. One cookie appearing from four countries in an
hour is the thing Sentinel exists to detect, and Fingerprint computes it
already.

### `suspectScore` plus the evasion products that actually arrive

`suspectScore` is Fingerprint's own risk number. Surfacing it beside Claude's
confidence score gives the demo two independent assessments, which is more
interesting than one — agreement is corroboration, disagreement is a talking
point about where model reasoning adds value over rules.

Alongside it, the evasion products this workspace actually receives — confirmed
against a live event, see the availability table below: `proxy`, `ipBlocklist`
(which carries `tor_node` and `attack_source`), and `highActivity`.

Do not build for `tor`, `remoteControl`, `developerTools`, `virtualMachine`,
`locationSpoofing`, or `mitmAttack` as separate products. An earlier draft of
this spec listed them; the sampled event does not return them, and the mobile-only
ones never will for a JS agent.

These are cheap to add once the storage exists — they render through the existing
`formatSignals()` mechanism, and each one that comes back non-null is a line the
model can use.

## Design

### 1. Persist the resolved event

Add to `Fingerprint`:

```prisma
/// Redacted snapshot of the resolved identification event. Null in OSS mode
/// and whenever verification did not resolve.
rawEvent Json?
```

Store a **snapshot taken at capture time**, not a live re-fetch on view. Three
reasons, each independently sufficient:

- Fingerprint's retention window expires. Older events return `RequestNotFound`,
  so a live-fetch details view dies on exactly the historical records the audit
  trail exists to preserve.
- A live fetch costs an API call per page view, on a page that polls every eight
  seconds.
- In OSS mode there is no server event at all, so a live-fetch button dead-ends
  on the fingerprints the app most needs to explain.

Store the event as returned, minus `identification.components` — that field is
large, and the individual entropy sources are not something this app reasons
about. No other redaction: this is a single-owner demo showing the owner their
own data.

Also promote the fields the UI and detection logic query directly into real
columns rather than reading them out of JSON — `ipCity`, `ipCountry`,
`firstSeenAt`, `suspectScore`. Querying and indexing JSON for the hot path is a
worse trade than four columns.

### 2. Extend the signals into the prompt

`FingerprintSignals` already has the shape for this, and the two-block split
between server-observed and locally-derived values is already in place. Adding a
product means one field on the interface, one `renderLines` entry in
`formatSignals()`, and one calibration line in the system prompt.

Two things to get right:

- Keep emitting only non-null signals. The existing comment explains why, and it
  matters much more at twenty signals than at seven: a wall of "unknown" spends
  tokens telling the model nothing and invites hedging on absent evidence.
- The prompt's calibration section needs weights, not just a list. Twenty
  booleans with no guidance on relative strength will produce worse scores than
  seven with guidance. `tor` = yes is not equivalent to `developerTools` = yes,
  and the model should be told so explicitly.

Geolocation needs a computed field rather than a raw dump: give the prompt the
distance between the two IP locations and both accuracy radii, not four decimal
coordinates it has to do trigonometry on.

### 3. UI

Extend the existing fingerprint comparison panel in `SessionTable.tsx` rather
than adding a separate page. The panel already renders two fingerprints
side by side with red diffs, which is the right frame — new fields inherit that
diffing for free.

Add a collapsed "Full details" section per fingerprint card, grouped:

- **Identification** — confidence, first seen, last seen, visitor found, replayed
- **Location** — city, country, coordinates, accuracy radius, ASN, datacenter
- **Device** — full browser version, OS version, device model
- **Risk** — suspect score, and every non-null evasion boolean
- **Velocity** — distinct IPs and countries over the available windows

Beneath it, a "Raw JSON" toggle rendering the stored snapshot in a `<pre>`.

The demo's entire value is making a hijack legible, so a JSON dump should not be
the primary presentation — but having it one click away reads as "nothing is
hidden," which is worth something on a security tool.

### 4. Keep it on the page, not behind a new route

Render the details from data that already arrives with the `/sessions` payload.
That page is authorized once, at the top, and the fingerprints it selects are
already scoped to the signed-in user's sessions — so there is nothing new to
guard.

Worth stating only because the obvious alternative has a trap: a standalone
`/fingerprint/[visitorId]/raw` route would be keyed on a value that is not a
secret. The visitor ID is rendered in the session table and appears in every
screenshot, so that route would hand any signed-in user anyone else's data. If a
separate route is ever wanted, key it on the `Fingerprint` row id and scope the
query by `userId`, which exists on the row as of the ownership change:

```ts
const fp = await prisma.fingerprint.findFirst({
  where: { id, userId: session.user.id },
})
```

Staying on the page avoids the question entirely, which is why it is preferred.

## Server-side verification is live and classifying correctly

Confirmed in production against stored data, 2026-07-28:

| requestId | verification |
| --- | --- |
| `1785212713091.qSOYHK` | `verified` |
| `fe4cabd0-0927-4b33-a356-…` | `unverifiable` |
| `58d1cfc3-e0c1-4ee6-ba3b-…` | `unverifiable` |

That is the whole classifier working end to end. The Pro-issued request ID
resolved against the Server API; the two UUID-shaped ones were recognized as
locally generated and skipped without spending a lookup. No client claim was
consulted for any of the three.

So the enrichment work below is unblocked — the events exist and are resolving.

**Do not use `vercel env pull` to audit whether a key is set.** Variables marked
Sensitive in Vercel are write-only and pull as empty strings, which is
indistinguishable from genuinely blank. An earlier revision of this document
concluded from exactly that signal that `FINGERPRINT_SERVER_API_KEY` was empty
and that server verification had never run. Both claims were wrong.

Check behaviour instead. Either query `Fingerprint.verification` for a `verified`
row, or sign in and request `GET /api/fingerprint/health`, which probes the API
and reports `ok`, `not_configured`, or a named error code.

One thing that generalizes beyond this project: `resolveFingerprint()` treats an
empty key and an absent key identically, because `!process.env.X` is true for
both. That is correct behaviour, but it means a blank value fails in exactly the
same silent way as a missing one — worth remembering the next time this is
diagnosed, given the `true\n` flag that silently failed `=== "true"` earlier in
this project's history.

## Remaining gap: the agent has to reach Fingerprint at all

Independent of the server key. That one governs whether Sentinel can *resolve* an
event; this governs whether one is ever *created*. Both have to be true, and
only the first is currently confirmed.

The stored data is suggestive: two `unverifiable` captures landed in the minutes
immediately before the one `verified` capture, on the same OS and browser. That
is the shape a Pro-to-OSS fallback leaves behind, though a manual mode toggle in
`/account` would look identical, so it is consistent with blocking rather than
evidence of it.

The Pro agent's default endpoints are on Fingerprint-owned hostnames, which
common blocklists carry. When they are blocked, `capturePro()` fails and the app
falls back to a client-computed OSS hash with a locally generated request ID —
unverifiable by construction. The "Pro unavailable" badge added in the last
change set makes that visible, but visible is not the same as fixed.

Fingerprint documents six integrations. Four (CloudFront, Azure FrontDoor,
Akamai, Fastly) are Enterprise-only. That leaves two:

| | DNS work | Origin | Trade-off | Plan |
| --- | --- | --- | --- | --- |
| Custom subdomain | CNAME + 2 A records | separate subdomain | Safari 16.4+ caps cookie lifetime at 7 days | all |
| Cloudflare proxy | none, if already on Cloudflare | same-origin | none documented | all |

**`davidkwartler.com` is already on Cloudflare** (`ruth.ns.cloudflare.com`,
`vern.ns.cloudflare.com`), so the second row is in reach — normally the harder
one to qualify for.

There is a catch. `sentinel.davidkwartler.com` currently resolves to Vercel's own
addresses (`216.198.79.65`, `64.29.17.65`) rather than Cloudflare's, so that
record is DNS-only — grey cloud. A Cloudflare Worker cannot intercept traffic
that never passes through Cloudflare's edge.

An earlier draft of this section concluded that the integration therefore
requires proxying `sentinel.davidkwartler.com` itself, putting Cloudflare in
front of Vercel permanently. **That is wrong**, and the error is worth recording
rather than quietly deleting, because it made the Cloudflare row look more
expensive than it is. Fingerprint's guide documents a DNS-only path: host the
worker on a *separate* subdomain that is proxied, and the main hostname is never
touched. No Cloudflare in front of Vercel, no SSL mode change, no new caching
path for the live site.

What that path does cost is the advantage the table credits it with. On a
proxied subdomain the requests go to `observatory.davidkwartler.com`, not
`sentinel.davidkwartler.com`, so it is no longer same-origin — the column above
describes the proxy-the-main-hostname variant, not the one we would actually
run. Both options collapse to a subdomain, differing mainly in who terminates
the request: Fingerprint's edge via A records, or a Worker on our own zone.

**Recommendation: custom subdomain first.** It is isolated — new records for a
new name, nothing about how `sentinel.davidkwartler.com` is served changes, and
nothing can break the running site. It needs no Workers account and no route
configuration, and the setup is three DNS records against a Worker plus routes
plus a proxied record. One of the setup guide's caveats is already cleared: the
domain has no CAA records to conflict with.

The Cloudflare route stays the upgrade path, and the Safari cookie cap below is
the reason it might eventually be worth taking — a Worker on our own zone is not
a CNAME to a third party, which is what ITP's heuristic keys on. Unverified, and
it would need testing before it justified the move.

### Decided: `observatory.davidkwartler.com`

Unused, and clean against EasyPrivacy's 56,382 rules.

Fingerprint's own guidance is to avoid `fp.` and `fingerprint.`, and their
suggested alternative is `metrics.` — which is the single most-represented token
in that list at 4,684 domains. `stats.` carries 1,269 and `analytics.` 1,048.
Those entries are per-domain rather than wildcards, so none of them would block a
new subdomain on day one; the reason to avoid them is that regex-based blockers
(Pi-hole and similar) do match such tokens generically, and a hostname that
announces itself as measurement is the kind a list maintainer adds by hand. The
name is chosen for shelf life, not for day-one evasion.

`observatory` reads as ordinary observability infrastructure to an engineer,
which is both good camouflage and immediately legible. The astronomy sense also
happens to describe the mechanism honestly: an observatory identifies distant
things by their characteristics, without those things participating.

Rejected for reasons worth not rediscovering: `sentry` collides with Sentry.io,
`watchtower` with the Docker container updater, `watchman` with Facebook's file
watcher, and `overlook` means *to fail to notice*. Generic infrastructure names
(`api`, `edge`, `gateway`, `core`) were rejected because the subdomain must be
dedicated to Fingerprint traffic and **cannot be edited after creation**, so
spending one of those on it forecloses a name worth keeping.

The hostname is deliberately invisible: it appears in devtools and nowhere else,
never in a screenshot or the README. Nothing about the name needs to explain
itself to a reader, which is why legibility to a blocklist mattered more than
legibility to a person.

### Setup, completed 2026-07-28

Steps 1–3 are done and verified; step 4 is the standing check. Kept as a record
of what was actually run, and see the note after step 4 for the one part that
was surprising.

1. Fingerprint dashboard, Settings > Subdomains > New subdomain:
   `observatory.davidkwartler.com`. It cannot be edited afterwards.
2. Add the CNAME and two A records it produces to Cloudflare DNS, **DNS-only
   (grey cloud)** — this record must resolve straight to Fingerprint, not
   through Cloudflare's edge. Validation expires after 14 days; propagation can
   take up to 24 hours.
3. Set both variables in Vercel production, then rebuild with
   `vercel --prod --force` — `NEXT_PUBLIC_*` is inlined at build time and a
   plain redeploy restores the cached build:

   ```
   NEXT_PUBLIC_FINGERPRINT_ENDPOINT="https://observatory.davidkwartler.com"
   NEXT_PUBLIC_FINGERPRINT_SCRIPT_URL="https://observatory.davidkwartler.com/web/v<version>/<apiKey>/loader_v<loaderVersion>.js"
   ```

   Leave both unset in development; the default endpoints are fine there and a
   subdomain would be one more thing to stand up.

4. Confirm with an ad blocker enabled: the fingerprint toast should read Pro
   rather than showing the "Pro unavailable" chip, and a new `Fingerprint` row
   should land with `verification = 'verified'`.

**Expect a 403 between steps 2 and 3.** Once the records resolve, and before
Fingerprint finishes provisioning the certificate, `observatory` returns
Cloudflare **Error 1000, "DNS points to prohibited IP"**. The reason is that the
A records Fingerprint issues are themselves Cloudflare addresses
(`162.159.141.170`, `172.66.1.166`), and until Fingerprint's Cloudflare for SaaS
hostname goes active, the request falls through to our own zone — which is on
Cloudflare and refuses to serve a record pointing at Cloudflare IPs. It is not a
misconfiguration and the grey-cloud setting is not the cause; both were verified
correct while the error was still showing.

Distinguish it by certificate. During provisioning the hostname serves this
zone's Universal SSL wildcard:

```
subject=CN=davidkwartler.com   SAN: davidkwartler.com, *.davidkwartler.com
```

When it clears, the subject becomes `CN=observatory.davidkwartler.com` and the
403 goes with it. In this setup that took minutes, not the documented 24 hours.

**Verifying it is actually in use.** The database cannot tell you. A row landing
with `verification = 'verified'` proves the Pro path worked, but the endpoint
fallback added alongside this change (`[observatory, defaultEndpoint]`) means a
silent fall back to Fingerprint's own endpoints produces an identical row. Only
the browser can answer it — check that both the loader `GET` and the
identification `POST` go to `observatory.davidkwartler.com`, and that no
`fpnpmcdn.net` or `api.fpjs.io` request appears beside them. The two are
controlled by different variables (`SCRIPT_URL` and `ENDPOINT`) and fail
independently, so confirming one says nothing about the other.

Confirmed in production on 2026-07-28. Three requests, all on the subdomain and
all resolving to one of the A records added above:

```
GET  /web/v3/<apiKey>/loader_v3.12.7.js      → 200   the loader, from SCRIPT_URL
GET  /7xy9vu-/C5Hha?q=<apiKey>               → 200   the agent bundle
POST /?ci=js/3.12.13&q=<apiKey>              → 200   identification, from ENDPOINT
                                    Remote Address: 162.159.141.170:443
```

The middle one is worth recognising. Fingerprint randomises the agent request
paths on a custom subdomain so a blocklist cannot pattern-match them, which is
the same reasoning that drove the hostname choice — expect an opaque path there
rather than anything resembling `fingerprint` or `fpjs`. Note also that the
loader package version and the agent bundle version differ (`3.12.7` against
`js/3.12.13`); the loader fetches whatever agent is current, and that is normal
rather than a version skew worth chasing.

A 200 on the POST is the conclusive result: the primary endpoint answered, so
the fallback never engaged.

The Safari trade-off is worth understanding rather than dismissing: it interacts
with `firstSeenAt` and `visitorFound`, recommended above as a top-four signal.
A 7-day cookie cap means Safari visitors look new more often than they are.
It degrades that one signal for one browser; it does not affect identification,
which is primarily fingerprint-derived. Acceptable for a demo, and the reason to
keep the Cloudflare route in mind as the eventual upgrade.

## Availability, confirmed against a real event

Sampled from event `1785212713091.qSOYHK`, visitor `zVyKOOEi0NifQOA9Hb8x`, a
live capture from `/products` in production.

| Product | Returns data | Notes |
| --- | --- | --- |
| `identification` | yes | `confidence.score` 1, `visitor_found`, `first_seen_at` |
| `ipInfo` | yes | full geolocation, ASN, `datacenter_result` |
| `velocity` | yes | 4 counters × 5min/1hr/24hr |
| `vpn` | yes | boolean, confidence, ML score, origin timezone, 6-method breakdown |
| `proxy` | yes | boolean, confidence, ML score |
| `tampering` | yes | boolean, confidence, ML score, anomaly score, anti-detect flag |
| `botd` | yes | `not_detected` |
| `ipBlocklist` | yes | `email_spam`, `attack_source`, `tor_node` |
| `suspectScore` | yes | 0 on this event |
| `highActivity` | yes | boolean |
| `incognito` | **absent** | confirmed absent — see below |
| `tor` | **yes** | present and unread, IP-derived — worth adding, see below |
| `mitmAttack`, `locationSpoofing` | yes | present but mobile-only semantics; never fire for browser traffic |
| `developerTools`, `privacySettings`, `rawDeviceAttributes`, `remoteControl`, `virtualMachine` | absent | web-relevant, not returned |
| `clonedApp`, `emulator`, `factoryReset`, `frida`, `rootApps` | returned | mobile-only semantics; present in the payload but meaningless for the JS agent |
| `proximity` | empty | key present, no data |

Two things about that table matter more than the rest.

**`incognito` is absent — confirmed, and the prompt has been corrected.**
Re-checked on 2026-07-29 against a stored `rawEvent` from a live Server API
capture, not the dashboard sample: nineteen product keys, no `incognito` among
them. So it is a plan limit, not a payload-shape artifact.

The mapping in `verifyFingerprint` is harmless — it resolves null and
`formatSignals` omits the line, so nothing false reaches the model. The problem
was in `claude.ts`, which carried a worked calibration example whose reasoning
read "consistent with incognito or storage reset on the same device." That
taught the model to explain away a changed visitor ID using evidence it can
never receive, and the direction of that error is under-flagging — treating a
real hijack as benign private browsing, which is the worse failure for a hijack
detector. The example and the surrounding guidance now describe the observable
pattern (identical characteristics, nothing else indicating a second device)
without naming a cause this plan cannot measure.

**Three products are present and unread, but only one is worth reading.** The
earlier table listed `tor`, `mitmAttack`, and `locationSpoofing` as absent; that
came from the dashboard/webhook sample, and the Server API disagrees. All three
returned `{"result": false}` on the live event.

Presence is not relevance, and the names mislead. Per the Server API schema:

- `tor` — "true if the request IP address is a known tor exit node". IP-derived
  and fully applicable to a browser. **Worth adding.** It is also the only
  source: `ipBlocklist.details` carries `emailSpam` and `attackSource` and
  nothing else, so the `tor_node` field an earlier draft of this document
  attributed to it does not exist.
- `locationSpoofing` — "the request came from a **mobile device** with location
  spoofing enabled". This is device GPS spoofing on a mobile SDK, not IP
  geolocation. It says nothing about whether the coordinates behind the
  impossible-travel comparison are fabricated, and will not fire for browser
  traffic. **Not applicable.**
- `mitmAttack` — documented as "`false` … when the request originated from a
  browser". **Not applicable.**

Worth stating plainly because the reverse was briefly believed: the
impossible-travel comparison has no Smart Signal backing it up. Its only defence
against fabricated coordinates remains the accuracy radius reported beside every
distance, plus the ASN and datacenter signals that would expose a hosting
origin. That is a real limitation, not a gap this plan can close.

**Mobile products are returned, not withheld.** `clonedApp`, `emulator`,
`factoryReset`, `frida`, and `rootApps` all appear in the payload. They carry no
meaning for a JS agent, so continue to ignore them — but the reason is
semantics, not availability.

### The sample is in the wrong shape

The payload above is the dashboard/webhook format: flat and snake_case
(`visitor_id`, `ip_info`, `browser_details`). The Server API that
`verifyFingerprint()` calls returns nested camelCase under `products`
(`products.identification.data.visitorId`). The availability findings carry over;
the field paths do not.

One concrete trap: `bot` is `"not_detected"` here and `"notDetected"` in the
Server API response. `fingerprint-server.ts` already compares against the
camelCase form, which is correct for the path it uses — but anyone mapping new
fields by reading the JSON above will get the casing wrong.

### Revision: prefer the ML scores over the booleans

The sample shows something the type surface did not make obvious. Every risk
product returns three values, not one:

```
"vpn": false, "vpn_confidence": "high", "vpn_ml_score": 0.037
"proxy": false, "proxy_confidence": "high", "proxy_ml_score": 0.142
"tampering": false, "tampering_confidence": "high", "tampering_ml_score": 0.0263
```

Sentinel currently reads only the boolean. A VPN score of 0.037 and one of 0.94
both serialize to `false` today, and the prompt is asked to weigh them
identically. Send the score and the confidence alongside the boolean and the
model gets to reason about a near-miss instead of a verdict — which is the
entire argument for having a model in this pipeline rather than a rule.

`tampering_details.anomaly_score` and `anti_detect_browser` are separate values
under the same product and worth passing through for the same reason.

### Revision: Fingerprint independently derives a timezone

Two fields in the sample resolve a problem this app currently works around:

```
"vpn_origin_timezone": "America/Chicago"
"vpn_methods": { "timezone_mismatch": false, ... }
"ip_info.v4.geolocation.timezone": "America/Chicago"
```

Sentinel takes `timezone` from `Intl.DateTimeFormat().resolvedOptions()` in the
browser — a client claim, which is why it now needs shape validation, and which
an attacker replaying a session can set to whatever the victim's was. Fingerprint
derives one server-side from the IP and reports whether the two disagree.

That means the timezone component of `computeSimilarity()` can move from a
client-reported string to a server-observed one, and `timezone_mismatch` becomes
a signal in its own right: a browser claiming a timezone its IP does not support
is doing something worth noticing.

### Revision: ASN and datacenter beat raw IP

```
"asn": "16591", "asn_name": "Google Fiber Inc.", "asn_type": "isp",
"datacenter_result": false
```

`asn_type` distinguishes a residential ISP from a hosting provider. A session
cookie that establishes on Google Fiber and reappears from a datacenter ASN is a
much sharper statement than "the IP changed," and it is the shape most real
cookie replay takes. This is cheap to add and probably the second-best signal in
the whole payload after geolocation.

`ip_events` in the velocity block is also worth noting: it read 4 over 24 hours
against 1 for `events`, meaning that IP served other identifications. On a
residential connection that is unremarkable; on a datacenter one it is not.

## Non-goals

- Re-fetching historical events to backfill `rawEvent`. Outside the retention
  window they are gone, and inside it the cost is an API call per row for data
  that was never displayed.
- Storing `identification.components`. Large, low-signal, and the individual
  entropy sources are not something this app reasons about.
- Redacting the stored event. This is a single-owner demo, the data is the
  owner's own, and Fingerprint publishes comparable detail in their public demo.
  The one judgement call worth keeping in mind is that this view will be
  screenshotted for the README, so pick a session whose location and IP you are
  happy to publish rather than trying to sanitize after the fact.
