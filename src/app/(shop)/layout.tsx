import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FingerprintReporter } from "@/components/FingerprintReporter"

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/products"
              className="text-sm font-semibold text-gray-900"
            >
              Sentinel
            </Link>
            <Link
              href="/products"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Products
            </Link>
            <Link
              href="/profile"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Profile
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">
              {session.user?.email}
            </span>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <FingerprintReporter />
    </div>
  )
}
