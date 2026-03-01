"use client"

import { useState } from "react"
import { useCart } from "./CartProvider"

export function CartDrawer() {
  const { items, totalItems, totalPrice, updateQty, removeItem, clearCart } =
    useCart()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Cart button — top right of content area */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setOpen(true)}
          className="relative rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          Cart
          {totalItems > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Cart ({totalItems})
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-center text-sm text-gray-400 mt-8">
              Your cart is empty.
            </p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-gray-100 p-3"
                >
                  <span className="text-2xl">{item.image}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm text-gray-900">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Total</span>
              <span className="text-sm font-semibold text-gray-900">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
            <p className="text-center text-xs text-gray-400">
              Checkout is not available — this is a demo.
            </p>
            <button
              onClick={clearCart}
              className="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </>
  )
}
