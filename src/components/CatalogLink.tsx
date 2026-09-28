"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ProductsIcon } from "@/components/icons"

// Stays in place on /products rather than disappearing: a header that gains
// and loses controls as you navigate feels unstable, and products -> detail ->
// back is the most-walked path in the app. On the catalog itself it becomes a
// non-interactive marker with aria-current, so it no longer claims to lead
// somewhere you already are. Geometry is identical either way, so nothing
// shifts between pages.
const BASE =
  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"

export function CatalogLink() {
  const pathname = usePathname()
  const isCurrent = pathname === "/products"

  const label = (
    <>
      <ProductsIcon className="h-4 w-4 text-gray-400" />
      <span className="sm:hidden">Products</span>
      <span className="hidden sm:inline">Product catalog</span>
    </>
  )

  if (isCurrent) {
    return (
      <span
        aria-current="page"
        className={`${BASE} cursor-default border-white/15 bg-white/10 text-gray-300`}
      >
        {label}
      </span>
    )
  }

  return (
    <Link
      href="/products"
      className={`${BASE} border-white/25 text-gray-100 hover:border-white/40 hover:bg-white/10 hover:text-white`}
    >
      {label}
    </Link>
  )
}
