"use client"

import { useEffect, useState } from "react"
import {
  FingerprintJSPro,
  type ExtendedGetResult,
} from "@fingerprintjs/fingerprintjs-pro-spa"
import {
  clampThreshold,
  FP_CACHE_KEY,
  FP_MODE_KEY,
  FP_PRO_STATUS_KEY,
  MODEL_KEY,
  THRESHOLD_KEY,
} from "@/lib/settings"

function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = "Unknown"
  if (ua.includes("Windows")) os = "Windows"
  else if (ua.includes("Mac OS")) os = "Mac OS X"
  else if (ua.includes("Android")) os = "Android"
  else if (ua.includes("Linux")) os = "Linux"
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS"

  let browser = "Unknown"
  if (ua.includes("Firefox/")) browser = "Firefox"
  else if (ua.includes("Edg/")) browser = "Edge"
  else if (ua.includes("Chrome/")) browser = "Chrome"
  else if (ua.includes("Safari/")) browser = "Safari"

  return { os, browser }
}

interface FingerprintPayload {
  visitorId: string
  requestId: string
  os: string
  browser: string
  screenRes: string
  timezone: string
  modelOverride?: string
  thresholdOverride?: number
  // Tells the server whether requestId is resolvable against Fingerprint's
  // server API (Pro) or is a locally generated UUID (OSS).
  mode?: "pro" | "oss"
}

// Loading the Pro SDK is network-bound; memoize the client at module level so
// repeat captures within a tab session don't re-download it.
let proClientPromise: ReturnType<typeof FingerprintJSPro.load> | null = null

export type ProFailureReason = "no_key" | "load_failed" | "get_failed"

type ProResult =
  | { ok: true; payload: FingerprintPayload }
  | { ok: false; reason: ProFailureReason }

// Distinguishing load_failed from get_failed isn't decorative: load failing is
// the ad-blocker case (Pro's agent endpoint is commonly blocked), while
// get_failed is more likely a real API/network error. no_key is configuration,
// not worth surfacing to a user — collapsing all three into `null` (the
// previous behaviour) meant nothing anywhere said Pro was attempted and
// failed, even though the mode badge silently switched to OSS underneath it.
async function capturePro(modelOverride?: string): Promise<ProResult> {
  const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY
  if (!apiKey) {
    console.warn("[Sentinel] NEXT_PUBLIC_FINGERPRINT_API_KEY not set")
    return { ok: false, reason: "no_key" }
  }

  let client: Awaited<ReturnType<typeof FingerprintJSPro.load>>
  try {
    // Serve the agent and its API from a first-party subdomain when one is
    // configured. Fingerprint's default endpoints are on hostnames common
    // blocklists carry, and a blocked agent silently degrades this app to an
    // unverifiable client-computed hash. Unset in development, where the
    // default endpoints are fine and a subdomain would be one more thing to
    // stand up.
    const endpoint = process.env.NEXT_PUBLIC_FINGERPRINT_ENDPOINT
    const scriptUrlPattern = process.env.NEXT_PUBLIC_FINGERPRINT_SCRIPT_URL
    proClientPromise ??= FingerprintJSPro.load({
      apiKey,
      ...(endpoint ? { endpoint: [endpoint] } : {}),
      ...(scriptUrlPattern ? { scriptUrlPattern: [scriptUrlPattern] } : {}),
    })
    client = await proClientPromise
  } catch (err) {
    console.warn("[Sentinel] Pro fingerprint agent failed to load:", err)
    proClientPromise = null
    return { ok: false, reason: "load_failed" }
  }

  try {
    const result = (await client.get({
      extendedResult: true,
    })) as ExtendedGetResult

    return {
      ok: true,
      payload: {
        visitorId: result.visitorId,
        requestId: result.requestId,
        os: result.os,
        browser: result.browserName,
        screenRes: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        modelOverride,
        mode: "pro",
      },
    }
  } catch (err) {
    console.warn("[Sentinel] Pro fingerprint capture failed:", err)
    return { ok: false, reason: "get_failed" }
  }
}

async function captureOss(modelOverride?: string): Promise<FingerprintPayload> {
  const FingerprintJS = await import("@fingerprintjs/fingerprintjs")
  const agent = await FingerprintJS.load()
  const result = await agent.get()

  const { os, browser } = parseUserAgent(navigator.userAgent)

  return {
    visitorId: result.visitorId,
    requestId: crypto.randomUUID(),
    os,
    browser,
    screenRes: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    modelOverride,
    mode: "oss",
  }
}

type FpStatus = "idle" | "capturing" | "done" | "cached"

// Fingerprint glyph from Ionicons v5 (MIT licensed, ionic-team/ionicons).
// Inlined rather than pulled from an icon package to keep the toast
// dependency-free; fill=currentColor so callers set the color, which is
// Fingerprint's brand orange, Orange 7 (#F35B22) per their 2024 brand
// guidelines, throughout the toast.
function FingerprintIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      <path d="M390.42,75.28a10.45,10.45,0,0,1-5.32-1.44C340.72,50.08,302.35,40,256.35,40c-45.77,0-89.23,11.28-128.76,33.84C122,77,115.11,74.8,111.87,69a12.4,12.4,0,0,1,4.63-16.32A281.81,281.81,0,0,1,256.35,16c49.23,0,92.23,11.28,139.39,36.48a12,12,0,0,1,4.85,16.08A11.3,11.3,0,0,1,390.42,75.28Zm-330.79,126a11.73,11.73,0,0,1-6.7-2.16,12.26,12.26,0,0,1-2.78-16.8c22.89-33.6,52-60,86.69-78.48C209.42,65,302.35,64.72,375.16,103.6c34.68,18.48,63.8,44.64,86.69,78a12.29,12.29,0,0,1-2.78,16.8,11.26,11.26,0,0,1-16.18-2.88c-20.8-30.24-47.15-54-78.36-70.56-66.34-35.28-151.18-35.28-217.29.24-31.44,16.8-57.79,40.8-78.59,71A10,10,0,0,1,59.63,201.28ZM204.1,491a10.66,10.66,0,0,1-8.09-3.6C175.9,466.48,165,453,149.55,424c-16-29.52-24.27-65.52-24.27-104.16,0-71.28,58.71-129.36,130.84-129.36S387,248.56,387,319.84a11.56,11.56,0,1,1-23.11,0c0-58.08-48.32-105.36-107.72-105.36S148.4,261.76,148.4,319.84c0,34.56,7.39,66.48,21.49,92.4,14.8,27.6,25,39.36,42.77,58.08a12.67,12.67,0,0,1,0,17A12.44,12.44,0,0,1,204.1,491Zm165.75-44.4c-27.51,0-51.78-7.2-71.66-21.36a129.1,129.1,0,0,1-55-105.36,11.57,11.57,0,1,1,23.12,0,104.28,104.28,0,0,0,44.84,85.44c16.41,11.52,35.6,17,58.72,17a147.41,147.41,0,0,0,24-2.4c6.24-1.2,12.25,3.12,13.4,9.84a11.92,11.92,0,0,1-9.47,13.92A152.28,152.28,0,0,1,369.85,446.56ZM323.38,496a13,13,0,0,1-3-.48c-36.76-10.56-60.8-24.72-86-50.4-32.37-33.36-50.16-77.76-50.16-125.28,0-38.88,31.9-70.56,71.19-70.56s71.2,31.68,71.2,70.56c0,25.68,21.5,46.56,48.08,46.56s48.08-20.88,48.08-46.56c0-90.48-75.13-163.92-167.59-163.92-65.65,0-125.75,37.92-152.79,96.72-9,19.44-13.64,42.24-13.64,67.2,0,18.72,1.61,48.24,15.48,86.64,2.32,6.24-.69,13.2-6.7,15.36a11.34,11.34,0,0,1-14.79-7,276.39,276.39,0,0,1-16.88-95c0-28.8,5.32-55,15.72-77.76,30.75-67,98.94-110.4,173.6-110.4,105.18,0,190.71,84.24,190.71,187.92,0,38.88-31.9,70.56-71.2,70.56s-71.2-31.68-71.2-70.56C303.5,293.92,282,273,255.42,273s-48.08,20.88-48.08,46.56c0,41,15.26,79.44,43.23,108.24,22,22.56,43,35,75.59,44.4,6.24,1.68,9.71,8.4,8.09,14.64A11.39,11.39,0,0,1,323.38,496Z" />
    </svg>
  )
}

interface FpCacheEntry {
  /** Opaque hash of the session this capture was sent for — see (shop)/layout.tsx. */
  key: string
  at: number
}

/**
 * A bare timestamp can't tell "still within the TTL" apart from "still within
 * the TTL, but for a session that ended and a new one started in the same tab
 * within the window" — sessionStorage isn't cleared by sign-out, so the old
 * value survives into the next session and the reporter would skip capture
 * for a session with no Fingerprint row at all. Malformed/legacy entries
 * (including the old bare-timestamp shape) are treated as a miss, not a throw.
 */
function readFpCache(): FpCacheEntry | null {
  const raw = sessionStorage.getItem(FP_CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.key === "string" && typeof parsed.at === "number") {
      return parsed as FpCacheEntry
    }
    return null
  } catch {
    return null
  }
}

function writeFpCache(key: string): void {
  sessionStorage.setItem(FP_CACHE_KEY, JSON.stringify({ key, at: Date.now() }))
}

export function FingerprintReporter({ sessionKey }: { sessionKey: string | null }) {
  const [status, setStatus] = useState<FpStatus>("idle")
  const [visible, setVisible] = useState(false)
  const [activeMode, setActiveMode] = useState<"pro" | "oss">("oss")
  // "Pro selected but unavailable in this browser" is a different situation
  // from "OSS because the user chose it" — the mode badge alone can't tell
  // them apart, since it just reports whichever path actually ran.
  const [proFailed, setProFailed] = useState(false)

  useEffect(() => {
    // Once a fingerprint is sent, skip re-capturing for the TTL window.
    // ProfileSettings clears this key when the fingerprint mode changes so the
    // next page load re-fingerprints under the new mode.
    // Resolve the mode before the cache check — the cached branch returns early,
    // and skipping this left the badge showing the "oss" initial state on every
    // cached load regardless of the mode actually in use.
    const fpMode = (localStorage.getItem(FP_MODE_KEY) || (process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ? "pro" : "oss")) as "pro" | "oss"
    setActiveMode(fpMode)

    const cached = readFpCache()
    const ttl = Number(process.env.NEXT_PUBLIC_FINGERPRINT_TTL_MS ?? 1_800_000)
    if (cached && cached.key === sessionKey && Date.now() - cached.at < ttl) {
      setStatus("cached")
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 2000)
      return () => clearTimeout(timer)
    }

    const modelOverride = localStorage.getItem(MODEL_KEY) || undefined
    // The server ignores this unless NEXT_PUBLIC_THRESHOLD_PICKER_ENABLED is
    // set, so don't bother reading it (or sending it) when the flag is off —
    // keeps the payload honest about what it's actually asking for.
    const thresholdPickerEnabled =
      process.env.NEXT_PUBLIC_THRESHOLD_PICKER_ENABLED === "true"
    const storedThreshold = Number(localStorage.getItem(THRESHOLD_KEY))
    const thresholdOverride =
      thresholdPickerEnabled &&
      localStorage.getItem(THRESHOLD_KEY) !== null &&
      Number.isFinite(storedThreshold)
        ? clampThreshold(storedThreshold)
        : undefined

    let cancelled = false

    async function submit(payload: FingerprintPayload): Promise<void> {
      const res = await fetch("/api/session/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        if (sessionKey) writeFpCache(sessionKey)
        if (!cancelled) {
          setStatus("done")
          setTimeout(() => setVisible(false), 3000)
        }
      }
    }

    async function capture() {
      try {
        setStatus("capturing")
        setVisible(true)

        let payload: FingerprintPayload
        if (fpMode === "pro") {
          const result = await capturePro(modelOverride)
          if (result.ok) {
            payload = result.payload
            sessionStorage.removeItem(FP_PRO_STATUS_KEY)
            if (!cancelled) setProFailed(false)
          } else {
            console.warn("[Sentinel] Pro fingerprint unavailable, falling back to OSS:", result.reason)
            // no_key is configuration, not a browser-side failure — nothing to
            // surface to the user, and no reason for ProfileSettings to show a
            // "Pro unavailable" note over what is really "Pro isn't set up".
            if (result.reason === "no_key") {
              sessionStorage.removeItem(FP_PRO_STATUS_KEY)
            } else {
              sessionStorage.setItem(FP_PRO_STATUS_KEY, result.reason)
              if (!cancelled) setProFailed(true)
            }
            payload = await captureOss(modelOverride)
          }
        } else {
          payload = await captureOss(modelOverride)
        }
        if (cancelled) return

        // Reflect the path actually taken, not just the preference — a Pro
        // preference that fell back to OSS must not leave the badge reading
        // "Pro" for a capture that didn't happen.
        setActiveMode(payload.mode ?? "oss")

        await submit({ ...payload, thresholdOverride })
      } catch (err) {
        console.error("[Sentinel] Fingerprint capture failed:", err)
        if (!cancelled) setVisible(false)
      }
    }

    capture()

    return () => {
      cancelled = true
    }
    // sessionKey changing means the session changed under this tab (sign out
    // + back in within the TTL window) — re-run so the new session gets its
    // own capture instead of reading the previous one's cache entry.
  }, [sessionKey])

  if (!visible) return null

  // Pro reads as the emphasized tier (solid brand orange), OSS as the quiet
  // one (outlined). Same family, two weights — not two unrelated hues.
  const modeBadge = (
    <span
      className={`rounded px-1.5 py-0.5 font-medium ${
        activeMode === "pro"
          ? "bg-[#F35B22] text-white"
          : "border border-gray-300 bg-white text-gray-600"
      }`}
    >
      {activeMode === "pro" ? "Pro" : "OSS"}
    </span>
  )

  // Left alone as the accurate report of the path that ran — this chip is the
  // separate claim that Pro was the intended path and it failed, which the
  // outline OSS badge alone doesn't say.
  const proUnavailableChip = proFailed && (
    <span
      className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800"
      title="FingerprintJS Pro failed to load or respond (often an ad blocker) — falling back to the open-source agent."
    >
      Pro unavailable
    </span>
  )

  return (
    // bottom-20 clears the footer (≈49px tall) when the page is scrolled to
    // the end — at bottom-4 the toast sat half on top of it.
    <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs shadow-md transition-opacity">
      {status === "capturing" && (
        <>
          <FingerprintIcon className="animate-pulse text-[#F35B22]" />
          <span className="text-gray-900">Registering fingerprint…</span>
          {modeBadge}
          {proUnavailableChip}
        </>
      )}
      {status === "done" && (
        <>
          <FingerprintIcon className="text-[#F35B22]" />
          <span className="text-gray-900">Fingerprint registered</span>
          {modeBadge}
          {proUnavailableChip}
        </>
      )}
      {status === "cached" && (
        <>
          <FingerprintIcon className="text-[#F35B22]" />
          <span className="text-gray-900">Fingerprint on file</span>
          {modeBadge}
        </>
      )}
    </div>
  )
}
