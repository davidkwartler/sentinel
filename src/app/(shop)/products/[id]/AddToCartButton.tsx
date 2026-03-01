"use client"

import { useCart } from "@/components/CartProvider"

export function AddToCartButton({
  product,
}: {
  product: { id: number; name: string; price: number; image: string }
}) {
  const { items, addItem, updateQty } = useCart()
  const inCart = items.find((i) => i.id === product.id)

  if (inCart) {
    return (
      <div className="mt-6 flex items-center gap-3">
        <div className="flex items-center rounded-md border border-gray-200">
          <button
            onClick={() => updateQty(product.id, inCart.qty - 1)}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            −
          </button>
          <span className="px-3 py-2 text-sm font-medium text-gray-900">
            {inCart.qty}
          </span>
          <button
            onClick={() => updateQty(product.id, inCart.qty + 1)}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
        </div>
        <span className="text-sm text-gray-500">in cart</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => addItem(product)}
      className="mt-6 rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
    >
      Add to Cart
    </button>
  )
}
