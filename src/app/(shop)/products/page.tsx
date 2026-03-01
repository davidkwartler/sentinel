import Link from "next/link"
import { products } from "./data"

export default function ProductsPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Products</h1>
      <p className="mb-6 text-sm text-gray-500">
        Browse our collection of products.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex h-24 items-center justify-center rounded-md bg-gray-50 text-4xl">
              {product.image}
            </div>
            <p className="text-xs text-gray-400">{product.category}</p>
            <p className="text-sm font-medium text-gray-900">{product.name}</p>
            <p className="mt-1 text-sm font-semibold text-gray-700">
              ${product.price.toFixed(2)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
