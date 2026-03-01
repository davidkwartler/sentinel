"use client"

import { useEffect } from "react"
import {
  FingerprintJSPro,
  type ExtendedGetResult,
} from "@fingerprintjs/fingerprintjs-pro-spa"

const CACHE_KEY = "sentinel_fp_sent"

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

export function FingerprintReporter() {
  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY)
    const ttl = Number(process.env.NEXT_PUBLIC_FINGERPRINT_TTL_MS ?? 1_800_000)
    if (cached && Date.now() - Number(cached) < ttl) return

    const fpMode = localStorage.getItem("sentinel_fp_mode") || "pro"
    const modelOverride =
      localStorage.getItem("sentinel_claude_model") || undefined

    let cancelled = false

    async function capturePro() {
      const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY
      if (!apiKey) {
        console.warn("[Sentinel] NEXT_PUBLIC_FINGERPRINT_API_KEY not set")
        return
      }

      const client = await FingerprintJSPro.load({ apiKey })
      const result = (await client.get({
        extendedResult: true,
      })) as ExtendedGetResult

      if (cancelled) return

      return {
        visitorId: result.visitorId,
        requestId: result.requestId,
        os: result.os,
        browser: result.browserName,
        screenRes: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        modelOverride,
      }
    }

    async function captureOss() {
      const FingerprintJS = await import("@fingerprintjs/fingerprintjs")
      const agent = await FingerprintJS.load()
      const result = await agent.get()

      if (cancelled) return

      const { os, browser } = parseUserAgent(navigator.userAgent)

      return {
        visitorId: result.visitorId,
        requestId: crypto.randomUUID(),
        os,
        browser,
        screenRes: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        modelOverride,
      }
    }

    async function capture() {
      try {
        const payload =
          fpMode === "oss" ? await captureOss() : await capturePro()
        if (!payload || cancelled) return

        const res = await fetch("/api/session/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          sessionStorage.setItem(CACHE_KEY, String(Date.now()))
        }
      } catch (err) {
        console.error("[Sentinel] Fingerprint capture failed:", err)
      }
    }

    capture()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
