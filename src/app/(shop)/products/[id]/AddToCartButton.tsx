"use client"

import { useState } from "react"

export function AddToCartButton() {
  const [showToast, setShowToast] = useState(false)

  function handleClick() {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className="mt-6 rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Add to Cart
      </button>
      {showToast && (
        <p className="mt-2 text-xs text-gray-400 animate-pulse">
          This is a demo — cart functionality is not implemented.
        </p>
      )}
    </div>
  )
}
