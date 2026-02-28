import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function HomePage() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">Sentinel</h1>
        <p className="mb-6 text-sm text-gray-500">You are authenticated.</p>

        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Signed in as:</span>{" "}
            {session.user?.name ?? session.user?.email ?? "Unknown"}
          </p>
          <p className="mt-1 text-xs text-gray-400">{session.user?.email}</p>
        </div>

        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            Sign out
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-400">
        Phase 2 will add product and profile pages here.
      </p>
    </main>
  )
}
