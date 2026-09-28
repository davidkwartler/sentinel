"use client"

import { useEffect, useRef, useState } from "react"
import { useCart } from "./CartProvider"
import { CartIcon } from "@/components/icons"

export function CartDrawer() {
  const { items, totalItems, totalPrice, updateQty, removeItem, clearCart } =
    useCart()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // A native modal dialog, opened with showModal(): the browser traps focus,
  // closes on Escape, makes the page behind it inert, and returns focus to
  // the cart button on close. Closed, it is display:none — the previous
  // translate-off-screen drawer stayed in the tab order and the
  // accessibility tree while hidden.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <>
      {/* Cart button — floated top right, aligned with page heading */}
      <div className="float-right">
        <button
          onClick={() => setOpen(true)}
          aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
          className="relative flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <CartIcon className="h-4 w-4 text-gray-500" />
          Cart
          {totalItems > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Shopping cart"
        onClose={() => setOpen(false)}
        // A click whose target is the dialog itself landed on the backdrop.
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-sm border-l border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/20 open:flex open:flex-col motion-safe:transition-transform motion-safe:duration-200 motion-safe:starting:open:translate-x-full"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Cart ({totalItems})
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close cart"
            className="text-gray-500 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-center text-sm text-gray-500 mt-8">
              Your cart is empty.
            </p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-gray-100 p-3"
                >
                  <span className="text-2xl" aria-hidden="true">{item.image}</span>
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
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm text-gray-900">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      aria-label={`Increase quantity of ${item.name}`}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="text-xs text-gray-500 hover:text-red-500"
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
            <p className="text-center text-xs text-gray-500">
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
      </dialog>
    </>
  )
}
