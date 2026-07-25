import Link from "next/link"
import { auth, signIn } from "@/lib/auth"
import { products } from "./data"
import { LoginModal } from "@/components/LoginModal"

export default async function ProductsPage() {
  const session = await auth()

  return (
    <div>
      {!session && (
        <LoginModal
          signInAction={async () => {
            "use server"
            await signIn("google", { redirectTo: "/" })
          }}
        />
      )}
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Products</h1>
      <p className="mb-6 text-sm text-gray-500">
        Browse the sample product catalog while Sentinel records your device
        fingerprint.
      </p>
      {/* One column of rows on phones, cards from sm up. Two 155px cards side
          by side left the name and price cramped; a full-width row gives the
          text the whole line. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:block sm:p-4"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gray-50 text-3xl sm:mb-3 sm:h-24 sm:w-auto sm:text-4xl">
              {product.image}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">{product.category}</p>
              <p className="truncate text-sm font-medium text-gray-900 sm:whitespace-normal">
                {product.name}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-700">
                ${product.price.toFixed(2)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
