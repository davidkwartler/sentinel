import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { FingerprintReporter } from "@/components/FingerprintReporter"
import { AccountMenu } from "@/components/AccountMenu"

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="min-h-screen bg-gray-50">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-gray-900 focus:shadow-md">Skip to main content</a>
      <nav aria-label="Main navigation" className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/products"
              className="text-sm font-semibold text-gray-900"
            >
              <span className="sm:hidden">🛡️</span>
              <span className="hidden sm:inline">🛡️ Sentinel</span>
            </Link>
            <Link
              href="/products"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Products
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
                className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                🔐 Sign in
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
