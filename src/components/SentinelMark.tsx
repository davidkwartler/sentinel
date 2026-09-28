"use client"

import { useId } from "react"
import { BRAND_VIOLET, SHIELD_PATH } from "@/components/icons"

// Four scanner corners around a 9.8 x 8.6-unit box centered on (12, 11).
const SCAN_BRACKETS =
  "M7.1 8.6V6.7H9M15 6.7H16.9V8.6M7.1 13.4V15.3H9M15 15.3H16.9V13.4"

// A 6.2 x 4.1-unit almond, flatter toward the corners.
const SCAN_EYE =
  "M8.9 11C9.985 9.0525 10.76 8.95 12 8.95C13.24 8.95 14.015 9.0525 15.1 11C14.015 12.9475 13.24 13.05 12 13.05C10.76 13.05 9.985 12.9475 8.9 11Z"

/**
 * The large-size Sentinel mark: the brand shield on a violet gradient with a
 * white iris scan (an eye inside scanner corner brackets). Use it at 32px and
 * up; below that, use the plain flat shield (src/app/icon.svg).
 *
 * A client component only for useId. Every instance needs its own gradient id:
 * with a shared id, the whole page resolves to whichever copy comes first, and
 * if that copy is hidden (display:none, e.g. a collapsed header) Chrome drops
 * the gradient and every mark on the page renders with no fill.
 */
export function SentinelMark({ className = "h-8 w-8" }: { className?: string }) {
  // React's ids contain characters (« » or :) that don't survive reliably
  // inside url(#...), so keep only the safe ones.
  const gradientId = `sentinel-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="4"
          y1="1"
          x2="20"
          y2="23"
        >
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.5" stopColor={BRAND_VIOLET} />
          <stop offset="1" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
      <path d={SHIELD_PATH} fill={`url(#${gradientId})`} />
      <path
        d={SCAN_BRACKETS}
        fill="none"
        stroke="white"
        strokeWidth={1.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={SCAN_EYE} fill="white" />
      {/* Solid rather than the gradient: at the eye's position the gradient is
          within a shade of brand violet, and one gradient reference per mark
          is one fewer thing to break. */}
      <circle cx="12" cy="11" r="1.05" fill={BRAND_VIOLET} />
    </svg>
  )
}
