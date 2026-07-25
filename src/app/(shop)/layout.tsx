import { auth, signOut } from "@/lib/auth"
import { FingerprintReporter } from "@/components/FingerprintReporter"
import { SiteHeader } from "@/components/SiteHeader"

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
      <SiteHeader
        session={session}
        signOutAction={async () => {
          "use server"
          await signOut({ redirectTo: "/products" })
        }}
      />
      {/* w-full is load-bearing: as a flex item, mx-auto would otherwise
          disable stretching and size main to its content, making every page a
          different width. */}
      <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-8">
        {children}
      </main>
      {session && <FingerprintReporter />}
    </div>
  )
}
