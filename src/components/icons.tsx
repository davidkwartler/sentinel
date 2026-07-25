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
      strokeWidth={1.75}
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
        strokeWidth={outlined ? 2 : undefined}
        strokeLinejoin="round"
      />
    </svg>
  )
}

// A price tag rather than the old four-square grid: the grid said "layout",
// not "things you can buy", and four thin squares turned to mush at 14px.
export function ProductsIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M10.15 3.25H15.5a1.25 1.25 0 0 1 1.25 1.25v5.35a1.5 1.5 0 0 1-.44 1.06l-5.4 5.4a1.5 1.5 0 0 1-2.12 0l-4.5-4.5a1.5 1.5 0 0 1 0-2.12l5.4-5.4a1.5 1.5 0 0 1 1.06-.44z" />
      <circle cx="13.4" cy="6.6" r="1.1" />
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

// A key, not the old monitor. A session is a credential, so the key says what
// the page is about; an empty screen just said "some device".
export function SessionsIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <circle cx="7.25" cy="7.25" r="3.5" />
      <path d="M9.75 9.75 16.25 16.25" />
      <path d="M12.5 12.5 11 14" />
      <path d="M14.25 14.25 12.75 15.75" />
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

// Two devices sharing one session — the mismatch Sentinel looks for.
export function DevicesIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <rect x="2.25" y="4.25" width="9.5" height="7" rx="1.25" />
      <path d="M5.25 14h4.5" />
      <path d="M7.5 11.25V14" />
      <rect x="13" y="8.5" width="4.75" height="8.25" rx="1.25" />
    </Stroke>
  )
}

export function FlagIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M5 17.25V3.5" />
      <path d="M5 4.25h8.75l-1.75 3.25 1.75 3.25H5" />
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

// Ionicons' fingerprint (MIT), the same mark the capture toast uses.
export function FingerprintIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M390.42,75.28a10.45,10.45,0,0,1-5.32-1.44C340.72,50.08,302.35,40,256.35,40c-45.77,0-89.23,11.28-128.76,33.84C122,77,115.11,74.8,111.87,69a12.4,12.4,0,0,1,4.63-16.32A281.81,281.81,0,0,1,256.35,16c49.23,0,92.23,11.28,139.39,36.48a12,12,0,0,1,4.85,16.08A11.3,11.3,0,0,1,390.42,75.28Zm-330.79,126a11.73,11.73,0,0,1-6.7-2.16,12.26,12.26,0,0,1-2.78-16.8c22.89-33.6,52-60,86.69-78.48C209.42,65,302.35,64.72,375.16,103.6c34.68,18.48,63.8,44.64,86.69,78a12.29,12.29,0,0,1-2.78,16.8,11.26,11.26,0,0,1-16.18-2.88c-20.8-30.24-47.15-54-78.36-70.56-66.34-35.28-151.18-35.28-217.29.24-31.44,16.8-57.79,40.8-78.59,71A10,10,0,0,1,59.63,201.28ZM204.1,491a10.66,10.66,0,0,1-8.09-3.6C175.9,466.48,165,453,149.55,424c-16-29.52-24.27-65.52-24.27-104.16,0-71.28,58.71-129.36,130.84-129.36S387,248.56,387,319.84a11.56,11.56,0,1,1-23.11,0c0-58.08-48.32-105.36-107.72-105.36S148.4,261.76,148.4,319.84c0,34.56,7.39,66.48,21.49,92.4,14.8,27.6,25,39.36,42.77,58.08a12.67,12.67,0,0,1,0,17A12.44,12.44,0,0,1,204.1,491Zm165.75-44.4c-27.51,0-51.78-7.2-71.66-21.36a129.1,129.1,0,0,1-55-105.36,11.57,11.57,0,1,1,23.12,0,104.28,104.28,0,0,0,44.84,85.44c16.41,11.52,35.6,17,58.72,17a147.41,147.41,0,0,0,24-2.4c6.24-1.2,12.25,3.12,13.4,9.84a11.92,11.92,0,0,1-9.47,13.92A152.28,152.28,0,0,1,369.85,446.56ZM323.38,496a13,13,0,0,1-3-.48c-36.76-10.56-60.8-24.72-86-50.4-32.37-33.36-50.16-77.76-50.16-125.28,0-38.88,31.9-70.56,71.19-70.56s71.2,31.68,71.2,70.56c0,25.68,21.5,46.56,48.08,46.56s48.08-20.88,48.08-46.56c0-90.48-75.13-163.92-167.59-163.92-65.65,0-125.75,37.92-152.79,96.72-9,19.44-13.64,42.24-13.64,67.2,0,18.72,1.61,48.24,15.48,86.64,2.32,6.24-.69,13.2-6.7,15.36a11.34,11.34,0,0,1-14.79-7,276.39,276.39,0,0,1-16.88-95c0-28.8,5.32-55,15.72-77.76,30.75-67,98.94-110.4,173.6-110.4,105.18,0,190.71,84.24,190.71,187.92,0,38.88-31.9,70.56-71.2,70.56s-71.2-31.68-71.2-70.56C303.5,293.92,282,273,255.42,273s-48.08,20.88-48.08,46.56c0,41,15.26,79.44,43.23,108.24,22,22.56,43,35,75.59,44.4,6.24,1.68,9.71,8.4,8.09,14.64A11.39,11.39,0,0,1,323.38,496Z" />
    </svg>
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
