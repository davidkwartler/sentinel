"use client"

import { useSyncExternalStore } from "react"
import { clampThreshold, DEFAULT_FLAG_THRESHOLD, THRESHOLD_KEY } from "@/lib/settings"

// Reading localStorage/sessionStorage in a mount effect and copying it into
// state renders twice and trips react-hooks/set-state-in-effect. Subscribing to
// storage as an external store does the same job in one pass: the server
// snapshot is null, so hydration still matches, and the client value takes
// over without an effect.
//
// The native "storage" event only fires in *other* tabs, so writes made through
// writeStorage() also dispatch a same-tab event that every subscriber hears.

type Area = "local" | "session"

const SAME_TAB_EVENT = "sentinel-storage"

function storageFor(area: Area): Storage | null {
  try {
    return area === "local" ? window.localStorage : window.sessionStorage
  } catch {
    // Blocked storage (some privacy modes) throws on access, not just on write.
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(SAME_TAB_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(SAME_TAB_EVENT, onChange)
  }
}

/** The stored string for `key`, or null (always null during SSR). */
export function useStorageValue(key: string, area: Area = "local"): string | null {
  return useSyncExternalStore(
    subscribe,
    () => storageFor(area)?.getItem(key) ?? null,
    () => null,
  )
}

/** True once rendering on the client — false on the server and during hydration. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}

/** Write (or, with null, remove) a value and notify same-tab subscribers. */
export function writeStorage(key: string, value: string | null, area: Area = "local"): void {
  const storage = storageFor(area)
  if (!storage) return
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // Quota or privacy-mode failures leave the previous value in place.
  }
  window.dispatchEvent(new Event(SAME_TAB_EVENT))
}

/**
 * The flag threshold the server will actually apply. Only read from storage
 * when the same build flag the server checks is on — otherwise the server uses
 * DEFAULT_FLAG_THRESHOLD, and a stale stored value would misreport the rule.
 */
export function useFlagThreshold(): number {
  const stored = useStorageValue(THRESHOLD_KEY)
  if (process.env.NEXT_PUBLIC_THRESHOLD_PICKER_ENABLED !== "true") {
    return DEFAULT_FLAG_THRESHOLD
  }
  const value = Number(stored)
  // Clamp on read as well as write — a value stored before the floor existed
  // would otherwise fall outside the supported range.
  return stored !== null && Number.isFinite(value) ? clampThreshold(value) : DEFAULT_FLAG_THRESHOLD
}
