import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { FingerprintReporter } from "@/components/FingerprintReporter"
import { AccountMenu } from "@/components/AccountMenu"
import { GridIcon, ShieldIcon, SignInIcon } from "@/components/icons"

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    // flex-1 rather than min-h-screen: the root layout owns full-viewport
    // height, and claiming it again here pushed the footer below the fold.
    <div className="flex flex-1 flex-col bg-gray-50">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-gray-900 focus:shadow-md">Skip to main content</a>
      <nav aria-label="Main navigation" className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/products"
              className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight text-gray-900"
            >
              {/* leading-none on the lockup: with default leading, items-center
                  aligns the mark to the line box including descender space, and
                  "Sentinel" has no descenders — so the mark reads low. */}
              <ShieldIcon className="h-6 w-6 text-[#7C3AED]" />
              <span className="hidden sm:inline">Sentinel</span>
            </Link>
            {/* Styled as a button rather than a bare link so it reads as an
                action next to the wordmark instead of part of it. */}
            <Link
              href="/products"
              className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
            >
              <GridIcon className="h-4 w-4 text-gray-500" />
              Product catalog
            </Link>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {session ? (
              <AccountMenu
                name={session.user?.name ?? null}
                email={session.user?.email ?? null}
                image={session.user?.image ?? null}
                signOutAction={async () => {
                  "use server"
                  await signOut({ redirectTo: "/products" })
                }}
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
        </div>
      </nav>
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      {session && <FingerprintReporter />}
    </div>
  )
}
