import { auth } from "@/lib/auth"

export default async function ProfilePage() {
  // Layout guarantees auth — session is always present here
  const session = (await auth())!

  const { user } = session

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Profile</h1>
      <p className="mb-6 text-sm text-gray-500">Your account details.</p>
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-4">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name ?? "Avatar"}
              className="h-14 w-14 rounded-full"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-400">
              {user?.name?.[0] ?? "?"}
            </div>
          )}
          <div>
            <p className="text-lg font-medium text-gray-900">
              {user?.name ?? "Unknown"}
            </p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div>
            <p className="text-xs font-medium uppercase text-gray-400">Name</p>
            <p className="text-sm text-gray-700">{user?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-400">
              Email
            </p>
            <p className="text-sm text-gray-700">{user?.email ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
