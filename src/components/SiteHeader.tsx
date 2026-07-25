import Link from "next/link"
import type { Session } from "next-auth"
import { AccountMenu } from "@/components/AccountMenu"
import { ProductsIcon, ShieldIcon, SignInIcon } from "@/components/icons"

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
    <nav aria-label="Main navigation" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href="/products"
            className="flex items-center gap-2.5 text-xl font-bold leading-none tracking-tight text-gray-900"
          >
            {/* leading-none on the lockup: with default leading, items-center
                aligns the mark to the line box including descender space, and
                "Sentinel" has no descenders — so the mark reads low. */}
            <ShieldIcon className="h-8 w-8" outlined />
            <span>Sentinel</span>
          </Link>
          {/* Styled as a button rather than a bare link so it reads as an
              action next to the wordmark instead of part of it. */}
          <Link
            href="/products"
            className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
          >
            <ProductsIcon className="h-4 w-4 text-gray-500" />
            {/* "Products" on phones so the wordmark keeps its room; the full
                label from sm up. */}
            <span className="sm:hidden">Products</span>
            <span className="hidden sm:inline">Product catalog</span>
          </Link>
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
                className="flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
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
