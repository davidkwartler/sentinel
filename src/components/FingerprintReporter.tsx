"use client"

import { useEffect } from "react"
import {
  FingerprintJSPro,
  type ExtendedGetResult,
} from "@fingerprintjs/fingerprintjs-pro-spa"

const CACHE_KEY = "sentinel_fp_sent"

export function FingerprintReporter() {
  useEffect(() => {
    if (sessionStorage.getItem(CACHE_KEY)) return

    const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY
    if (!apiKey) {
      console.warn("[Sentinel] NEXT_PUBLIC_FINGERPRINT_API_KEY not set")
      return
    }

    let cancelled = false

    async function capture() {
      try {
        const client = await FingerprintJSPro.load({ apiKey: apiKey! })
        const result = (await client.get({
          extendedResult: true,
        })) as ExtendedGetResult

        if (cancelled) return

        const payload = {
          visitorId: result.visitorId,
          requestId: result.requestId,
          os: result.os,
          browser: result.browserName,
          screenRes: `${screen.width}x${screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }

        const res = await fetch("/api/session/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          sessionStorage.setItem(CACHE_KEY, "1")
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
