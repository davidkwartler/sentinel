import { auth, signIn } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ShieldIcon } from "@/components/icons"
import { GoogleSignInButton, HowItWorks } from "@/components/SignInPanel"
import { SiteHeader } from "@/components/SiteHeader"

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect("/products")
  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      {/* showAuth off: the sign-in button would link to this page. */}
      <SiteHeader session={null} showAuth={false} />
      {/* px-4: the card's max-w-sm (384px) exceeds a 375px viewport, so
          without a gutter it ran edge to edge on an iPhone. */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 flex items-center justify-center gap-2.5 text-center text-2xl font-semibold leading-none text-gray-900">
          <ShieldIcon className="h-8 w-8" outlined />
          Sentinel
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Session hijack detection demo
        </p>
        <GoogleSignInButton
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/" })
          }}
        />
        <HowItWorks />
      </div>
      </main>
    </div>
  )
}
