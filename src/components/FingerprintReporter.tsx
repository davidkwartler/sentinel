"use client"

import { useEffect, useState } from "react"
import {
  FingerprintJSPro,
  type ExtendedGetResult,
} from "@fingerprintjs/fingerprintjs-pro-spa"
import { FP_CACHE_KEY, FP_MODE_KEY, MODEL_KEY, THRESHOLD_KEY } from "@/lib/settings"

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

async function capturePro(modelOverride?: string): Promise<FingerprintPayload | null> {
  const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY
  if (!apiKey) {
    console.warn("[Sentinel] NEXT_PUBLIC_FINGERPRINT_API_KEY not set")
    return null
  }

  try {
    proClientPromise ??= FingerprintJSPro.load({ apiKey })
    const client = await proClientPromise
    const result = (await client.get({
      extendedResult: true,
    })) as ExtendedGetResult

    return {
      visitorId: result.visitorId,
      requestId: result.requestId,
      os: result.os,
      browser: result.browserName,
      screenRes: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      modelOverride,
      mode: "pro",
    }
  } catch (err) {
    console.warn("[Sentinel] Pro fingerprint failed:", err)
    proClientPromise = null
    return null
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

export function FingerprintReporter() {
  const [status, setStatus] = useState<FpStatus>("idle")
  const [visible, setVisible] = useState(false)
  const [activeMode, setActiveMode] = useState<"pro" | "oss">("oss")

  useEffect(() => {
    // Once a fingerprint is sent, skip re-capturing for the TTL window.
    // ProfileSettings clears this key when the fingerprint mode changes so the
    // next page load re-fingerprints under the new mode.
    const cached = sessionStorage.getItem(FP_CACHE_KEY)
    const ttl = Number(process.env.NEXT_PUBLIC_FINGERPRINT_TTL_MS ?? 1_800_000)
    if (cached && Date.now() - Number(cached) < ttl) {
      setStatus("cached")
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 2000)
      return () => clearTimeout(timer)
    }

    const fpMode = (localStorage.getItem(FP_MODE_KEY) || (process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ? "pro" : "oss")) as "pro" | "oss"
    setActiveMode(fpMode)
    const modelOverride = localStorage.getItem(MODEL_KEY) || undefined
    const storedThreshold = Number(localStorage.getItem(THRESHOLD_KEY))
    const thresholdOverride =
      Number.isInteger(storedThreshold) && storedThreshold >= 0 && storedThreshold <= 100 && localStorage.getItem(THRESHOLD_KEY) !== null
        ? storedThreshold
        : undefined

    let cancelled = false

    async function submit(payload: FingerprintPayload): Promise<void> {
      const res = await fetch("/api/session/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        sessionStorage.setItem(FP_CACHE_KEY, String(Date.now()))
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

        let payload = fpMode === "pro" ? await capturePro(modelOverride) : null
        if (!payload) {
          if (fpMode === "pro") {
            console.warn("[Sentinel] Pro fingerprint unavailable, falling back to OSS")
          }
          payload = await captureOss(modelOverride)
        }
        if (cancelled) return

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
  }, [])

  if (!visible) return null

  const modeBadge = (
    <span className={`rounded px-1.5 py-0.5 font-medium ${activeMode === "pro" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"}`}>
      {activeMode === "pro" ? "Pro" : "OSS"}
    </span>
  )

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs shadow-md transition-opacity">
      {status === "capturing" && (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          <span className="text-gray-600">Registering fingerprint…</span>
          {modeBadge}
        </>
      )}
      {status === "done" && (
        <>
          <span className="text-green-600">✓</span>
          <span className="text-gray-600">Fingerprint registered</span>
          {modeBadge}
        </>
      )}
      {status === "cached" && (
        <>
          <span className="text-green-600">✓</span>
          <span className="text-gray-400">Fingerprint on file</span>
          {modeBadge}
        </>
      )}
    </div>
  )
}
