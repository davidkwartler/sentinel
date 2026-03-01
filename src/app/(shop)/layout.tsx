import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { FingerprintReporter } from "@/components/FingerprintReporter"

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
            {session && (
              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Sessions
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {session ? (
              <>
                <Link href="/profile" className="flex items-center gap-2">
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-7 w-7 rounded-full"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                      {session.user?.name?.[0] ?? "?"}
                    </div>
                  )}
                  <span className="hidden text-sm text-gray-600 hover:text-gray-900 sm:inline">
                    Account
                  </span>
                </Link>
                <form
                  action={async () => {
                    "use server"
                    await signOut({ redirectTo: "/products" })
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Sign out
                  </button>
                </form>
              </>
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
