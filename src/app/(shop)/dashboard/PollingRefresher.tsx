"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function PollingRefresher({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, router])

  return null
}
