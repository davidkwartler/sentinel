"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ProductsIcon, SessionsIcon, WarningIcon } from "@/components/icons"

// The header's section links, labelled to match the page titles they lead to.
// The logo is the home link; these are sections, so each stays a real link on
// every page and is marked current (aria-current) while you're inside its
// section, instead of turning into a dead label on its own page.
const BASE =
  "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition-colors sm:px-3"
const IDLE =
  "border-white/25 text-gray-100 hover:border-white/40 hover:bg-white/10 hover:text-white"
const CURRENT = "border-white/15 bg-white/10 text-white"

export function NavLinks({
  signedIn,
  flaggedCount,
}: {
  signedIn: boolean
  flaggedCount: number
}) {
  const pathname = usePathname()
  const inProducts = pathname === "/products" || pathname.startsWith("/products/")
  const inSessions = pathname === "/sessions"
  const flagged = flaggedCount > 0

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/products"
        aria-current={inProducts ? "page" : undefined}
        className={`${BASE} ${inProducts ? CURRENT : IDLE}`}
      >
        <ProductsIcon className="h-4 w-4 text-gray-400" />
        Products
      </Link>
      {/* Signed-in only, like the page it leads to. */}
      {signedIn && (
        <Link
          href="/sessions"
          aria-current={inSessions ? "page" : undefined}
          aria-label={
            flagged
              ? `Sessions, ${flaggedCount} flagged`
              : undefined
          }
          title={flagged ? `${flaggedCount} flagged ${flaggedCount === 1 ? "session" : "sessions"}` : undefined}
          className={`${BASE} ${inSessions ? CURRENT : IDLE}`}
        >
          <SessionsIcon className="h-4 w-4 text-gray-400" />
          Sessions
          {flagged && <WarningIcon className="h-4 w-4" />}
        </Link>
      )}
    </div>
  )
}
