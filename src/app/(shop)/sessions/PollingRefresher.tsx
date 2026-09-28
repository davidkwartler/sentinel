"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Each refresh is a full server render with database queries behind it, so
// poll only while someone can see the result. A hidden tab stops polling, and
// becoming visible again refreshes at once rather than waiting out the rest of
// an interval that may have gone stale long ago.
export function PollingRefresher({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    function start() {
      if (timer === null) timer = setInterval(() => router.refresh(), intervalMs)
    }
    function stop() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    function onVisibilityChange() {
      if (document.hidden) {
        stop()
      } else {
        router.refresh()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [intervalMs, router])

  return null
}
