import Link from "next/link"
import { notFound } from "next/navigation"
import { products } from "../data"
import { AddToCartButton } from "./AddToCartButton"

export function generateStaticParams() {
  return products.map((product) => ({ id: String(product.id) }))
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = products.find((p) => p.id === Number(id))

  if (!product) {
    notFound()
  }

  return (
    <div>
      <Link
        href="/products"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Products
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex h-48 w-full items-center justify-center rounded-md bg-gray-50 text-7xl sm:h-56 sm:w-56 sm:shrink-0">
            {product.image}
          </div>

          <div className="flex-1">
            <p className="text-xs text-gray-400">{product.category}</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">
              {product.name}
            </h1>
            <p className="mt-2 text-xl font-semibold text-gray-700">
              ${product.price.toFixed(2)}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              {product.description}
            </p>
            <AddToCartButton product={{ id: product.id, name: product.name, price: product.price, image: product.image }} />
          </div>
        </div>
      </div>
    </div>
  )
}
