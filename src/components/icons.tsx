// Shared UI glyphs. 20px stroke outlines so nav, menu, footer, and buttons all
// draw from one set — previously each surface inlined its own <svg> frame and
// they drifted on stroke width and color.

function Stroke({
  className = "h-4 w-4",
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

// The Sentinel mark: Remix Icon's faceted shield (Apache 2.0,
// Remix-Design/RemixIcon) in brand violet. Violet because red, amber, green,
// and orange all carry status meaning elsewhere in the app.
export const BRAND_VIOLET = "#7C3AED"
export const BRAND_VIOLET_DARK = "#4C1D95"

const SHIELD_PATH =
  "M3.78307 2.82598L12 1L20.2169 2.82598C20.6745 2.92766 21 3.33347 21 3.80217V13.7889C21 15.795 19.9974 17.6684 18.3282 18.7812L12 23L5.6718 18.7812C4.00261 17.6684 3 15.795 3 13.7889V3.80217C3 3.33347 3.32553 2.92766 3.78307 2.82598Z"

/**
 * `outlined` adds the darker keyline used at header sizes. Leave it off below
 * roughly 20px — the stroke eats too much of the shape and the mark reads
 * muddy rather than violet.
 */
export function ShieldIcon({
  className = "h-5 w-5",
  outlined = false,
}: {
  className?: string
  outlined?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={BRAND_VIOLET}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d={SHIELD_PATH}
        stroke={outlined ? BRAND_VIOLET_DARK : undefined}
        strokeWidth={outlined ? 1.2 : undefined}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GridIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <rect x="2.75" y="3.25" width="6" height="6" rx="1.25" />
      <rect x="11.25" y="3.25" width="6" height="6" rx="1.25" />
      <rect x="2.75" y="10.75" width="6" height="6" rx="1.25" />
      <rect x="11.25" y="10.75" width="6" height="6" rx="1.25" />
    </Stroke>
  )
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16.25a5.5 5.5 0 0 1 11 0" />
    </Stroke>
  )
}

export function MonitorIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <rect x="2.75" y="4.25" width="14.5" height="10" rx="1.5" />
      <path d="M7 16.75h6" />
      <path d="M10 14.25v2.5" />
    </Stroke>
  )
}

export function SignOutIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M12.5 6.5V4.75A1.25 1.25 0 0 0 11.25 3.5h-5A1.25 1.25 0 0 0 5 4.75v10.5a1.25 1.25 0 0 0 1.25 1.25h5a1.25 1.25 0 0 0 1.25-1.25V13.5" />
      <path d="M9 10h8m0 0-2.5-2.5M17 10l-2.5 2.5" />
    </Stroke>
  )
}

// Mirror of SignOutIcon — arrow points into the door rather than out of it.
export function SignInIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M7.5 6.5V4.75A1.25 1.25 0 0 1 8.75 3.5h5A1.25 1.25 0 0 1 15 4.75v10.5a1.25 1.25 0 0 1-1.25 1.25h-5a1.25 1.25 0 0 1-1.25-1.25V13.5" />
      <path d="M11 10H3m0 0 2.5-2.5M3 10l2.5 2.5" />
    </Stroke>
  )
}

export function CartIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M2.5 3.5h1.8l1.6 8.4a1.25 1.25 0 0 0 1.23 1.02h6.36a1.25 1.25 0 0 0 1.23-1.01l1.03-5.41H5" />
      <circle cx="8" cy="16.25" r="1" />
      <circle cx="14" cy="16.25" r="1" />
    </Stroke>
  )
}

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}
