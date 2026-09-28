"use client"

import { useId } from "react"
import { BRAND_VIOLET, SHIELD_PATH } from "@/components/icons"

// Everything is centered on (12, 10.7) rather than the box's middle: the
// shield's pointed bottom puts its visual center about 0.3 units above its
// geometric one, and a scan at y=11 looks like it's sagging.
//
// Sized for the smallest place this mark appears: 32 CSS px in the header,
// which is 32 physical pixels on a standard (1x) screen. At the first shipped
// weights (1.05-unit strokes, 1.9-unit arms) the corners rendered as faint
// ticks there; 1.3 and 2.2 keep them reading as corners.

// Four scanner corners around a 9.2 x 8-unit box, 1.3 units wide.
const SCAN_BRACKETS =
  "M7.4 8.9V6.7H9.6M14.4 6.7H16.6V8.9M7.4 12.5V14.7H9.6M14.4 14.7H16.6V12.5"
const SCAN_STROKE = 1.3

// A 6.2 x 4.4-unit almond, flatter toward the corners.
const SCAN_EYE =
  "M8.9 10.7C9.985 8.61 10.76 8.5 12 8.5C13.24 8.5 14.015 8.61 15.1 10.7C14.015 12.79 13.24 12.9 12 12.9C10.76 12.9 9.985 12.79 8.9 10.7Z"

// Dark rather than brand violet: at 32px a violet pupil blurred into the
// shield around the eye, and a darker, larger one reads as an eye.
const PUPIL_COLOR = "#4C1D95"

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
        strokeWidth={SCAN_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={SCAN_EYE} fill="white" />
      <circle cx="12" cy="10.7" r="1.25" fill={PUPIL_COLOR} />
    </svg>
  )
}
