import Link from "next/link"
import type { Session } from "next-auth"
import { AccountMenu } from "@/components/AccountMenu"
import { SignInIcon } from "@/components/icons"
import { SentinelMark } from "@/components/SentinelMark"
import { CatalogLink } from "@/components/CatalogLink"

// Shared across the shop layout and the login page so the brand and catalog
// link stay put while signing in. `showAuth` hides the account controls — on
// /login the sign-in button would point at the page you are already on.
export function SiteHeader({
  session,
  showAuth = true,
  signOutAction,
}: {
  session: Session | null
  showAuth?: boolean
  signOutAction?: () => Promise<void>
}) {
  return (
    // An ink band: the one dark surface in the otherwise light-only Aurora Flat
    // UI, which gives the page a top edge and puts the violet mark on its
    // strongest background. data-surface="ink" switches the focus outline to
    // a light violet (globals.css); brand violet is too dark to see on ink.
    <nav aria-label="Main navigation" data-surface="ink" className="border-b border-gray-900 bg-gray-900">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href="/products"
            className="flex items-center gap-2.5 text-xl font-bold leading-none tracking-tight text-white"
          >
            {/* leading-none on the lockup: with default leading, items-center
                aligns the mark to the line box including descender space, and
                "Sentinel" has no descenders — so the mark reads low. */}
            <SentinelMark className="h-8 w-8" />
            <span>Sentinel</span>
          </Link>
          {/* Styled as a button rather than a bare link so it reads as an
              action next to the wordmark instead of part of it. Client
              component: it needs the pathname to mark itself current. */}
          <CatalogLink />
        </div>

        {showAuth && (
          <div className="flex items-center gap-3 sm:gap-4">
            {session && signOutAction ? (
              <AccountMenu
                name={session.user?.name ?? null}
                email={session.user?.email ?? null}
                image={session.user?.image ?? null}
                signOutAction={signOutAction}
              />
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
              >
                <SignInIcon className="h-4 w-4" />
                Sign in
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
