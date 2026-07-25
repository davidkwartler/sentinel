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

export const DEFAULT_MODEL = "claude-haiku-4-5"

// Sentinel value for "skip GenAI analysis entirely" — flag on fingerprint
// mismatch alone.
export const ANALYSIS_OFF = "off"

// Events at or above this confidence score are FLAGGED; below it, CLEAR.
// Overridable per-request via the profile settings slider.
export const DEFAULT_FLAG_THRESHOLD = 70

export const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  { value: "claude-sonnet-5", label: "Sonnet 5" },
  { value: "claude-opus-5", label: "Opus 5" },
  { value: ANALYSIS_OFF, label: "Off" },
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
