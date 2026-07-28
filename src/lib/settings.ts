// Shared constants used on both the client (settings UI, reporter) and the
// server (model allowlist validation). Keep plain data only — no imports with
// side effects.

// localStorage / sessionStorage keys. FP_CACHE_KEY is the fingerprint-sent
// timestamp; ProfileSettings clears it when the fingerprint mode changes so the
// next page load re-fingerprints (FingerprintReporter otherwise skips capture
// for the TTL window).
export const FP_MODE_KEY = "sentinel_fp_mode"
export const MODEL_KEY = "sentinel_claude_model"
export const FP_CACHE_KEY = "sentinel_fp_sent"
export const THRESHOLD_KEY = "sentinel_flag_threshold"
// Set by FingerprintReporter when Pro fingerprinting is attempted and fails
// (most commonly an ad blocker), cleared on success. ProfileSettings reads it
// to surface "Pro selected but unavailable in this browser" — distinguishing
// that from "OSS because the user chose it" requires this, since the mode
// badge alone just reports whichever path actually ran.
export const FP_PRO_STATUS_KEY = "sentinel_fp_pro_status"

export const DEFAULT_MODEL = "claude-haiku-4-5"

// Sentinel value for "skip GenAI analysis entirely" — flag on fingerprint
// mismatch alone.
export const ANALYSIS_OFF = "off"

// Events at or above this confidence score are FLAGGED; below it, CLEAR.
// Overridable per-request via the profile settings slider.
export const DEFAULT_FLAG_THRESHOLD = 70

// Floor for the adjustable threshold. Below roughly this level every mismatch
// flags, which makes the analysis decorative — the score stops changing the
// outcome. Enforced in the UI and again server-side.
export const MIN_FLAG_THRESHOLD = 20
export const MAX_FLAG_THRESHOLD = 100

/** Clamp a stored or submitted threshold into the supported range. */
export function clampThreshold(value: number): number {
  return Math.min(MAX_FLAG_THRESHOLD, Math.max(MIN_FLAG_THRESHOLD, Math.round(value)))
}

// Ordered as a power ramp: Off is the zero end, then increasing capability.
export const MODEL_OPTIONS = [
  { value: ANALYSIS_OFF, label: "Off" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  { value: "claude-sonnet-5", label: "Sonnet 5" },
  { value: "claude-opus-5", label: "Opus 5" },
] as const

// Server-side allowlist for the client-supplied modelOverride — prevents a
// crafted request from selecting an arbitrary (or expensive) model. "off" is
// accepted alongside real model IDs and skips Claude analysis entirely.
export const ANALYSIS_MODEL_IDS = [
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
  ANALYSIS_OFF,
] as const

// Shape validation for client-reported fingerprint components. A length cap
// alone (the previous hardening) still leaves ample room for prompt-injection
// text; these validate that the value actually looks like the thing it claims
// to be. A value failing its check is normalized away server-side rather than
// rejected — see route.ts — since a malformed value is itself a signal, and a
// 400 would throw that signal away along with the request.
export const SCREEN_RES_PATTERN = /^\d{2,5}x\d{2,5}$/

// The hand-rolled OSS parser (FingerprintReporter.tsx) and FingerprintJS Pro's
// own vocabulary (result.os / result.browserName) are not the same taxonomy,
// so both are represented here. ASSUMPTION NOT YET CONFIRMED: the Pro entries
// are FingerprintJS's documented common values, not captured from a live Pro
// payload in this environment — reconcile against a real Pro response before
// relying on this list to not reject legitimate Pro traffic.
export const KNOWN_OS = [
  // OSS parser (FingerprintReporter.tsx parseUserAgent)
  "Mac OS X",
  "Windows",
  "Android",
  "Linux",
  "iOS",
  "Unknown",
  // FingerprintJS Pro vocabulary
  "Windows Phone",
  "Chrome OS",
  "Ubuntu",
  "FreeBSD",
  "Fedora",
  "Debian",
  "Chromium OS",
] as const

export const KNOWN_BROWSERS = [
  // OSS parser (FingerprintReporter.tsx parseUserAgent)
  "Firefox",
  "Edge",
  "Chrome",
  "Safari",
  "Unknown",
  // FingerprintJS Pro vocabulary
  "Chrome Mobile",
  "Mobile Safari",
  "Samsung Internet",
  "Opera",
  "Yandex Browser",
  "IE",
  "Firefox Mobile",
  "Edge Mobile",
] as const
