import Link from "next/link"

// Icons match the account menu's glyphs so the same destination reads the same
// wherever it appears. GitHub and LinkedIn marks are the standard brand paths,
// as used on davidkwartler.com.
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
    >
      {children}
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

const linkClass =
  "flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"

function Divider() {
  return <span className="hidden text-gray-300 sm:inline">|</span>
}

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-4 text-xs sm:justify-start">
        <Link href="/products" className={linkClass}>
          <Glyph>
            <rect x="2.75" y="3.25" width="6" height="6" rx="1.25" />
            <rect x="11.25" y="3.25" width="6" height="6" rx="1.25" />
            <rect x="2.75" y="10.75" width="6" height="6" rx="1.25" />
            <rect x="11.25" y="10.75" width="6" height="6" rx="1.25" />
          </Glyph>
          Products
        </Link>
        <Link href="/account" className={linkClass}>
          <Glyph>
            <circle cx="10" cy="7" r="3" />
            <path d="M4.5 16.25a5.5 5.5 0 0 1 11 0" />
          </Glyph>
          Account
        </Link>
        <Link href="/sessions" className={linkClass}>
          <Glyph>
            <rect x="2.75" y="4.25" width="14.5" height="10" rx="1.5" />
            <path d="M7 16.75h6" />
            <path d="M10 14.25v2.5" />
          </Glyph>
          Sessions
        </Link>

        <Divider />

        <p className="text-gray-500">
          &copy; {new Date().getFullYear()} David Kwartler. All rights reserved.
        </p>

        <Divider />

        <a
          href="https://www.linkedin.com/in/dkwartler/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          <LinkedInIcon />
          LinkedIn
        </a>
        <a
          href="https://github.com/davidkwartler/sentinel"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          <GitHubIcon />
          GitHub
        </a>
      </div>
    </footer>
  )
}
