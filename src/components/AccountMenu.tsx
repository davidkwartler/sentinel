"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { SessionsIcon, SignOutIcon, UserIcon } from "@/components/icons"
import { FP_CACHE_KEY } from "@/lib/settings"

// One size and color for every menu glyph; the shapes come from the shared
// icon set so a destination looks the same here, in the footer, and in the nav.
const MENU_ICON = "h-4 w-4 text-gray-500"

// Sign out is destructive and irreversible in one click, so it lives inside
// this menu rather than sitting in the nav at the same weight as navigation
// links. The server action is passed in from the layout, which is where
// Auth.js's signOut can run.
export function AccountMenu({
  name,
  email,
  image,
  signOutAction,
}: {
  name: string | null
  email: string | null
  image: string | null
  signOutAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const avatar = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="h-7 w-7 rounded-full" />
  ) : (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
      {name?.[0] ?? "?"}
    </div>
  )

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-gray-300 py-1 pl-1 pr-2.5 transition-colors hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        {avatar}
        <span className="hidden text-sm text-gray-700 sm:inline">Account</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-gray-900">
              {name ?? "Signed in"}
            </p>
            {email && (
              <p className="truncate text-xs text-gray-600">{email}</p>
            )}
          </div>

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              <UserIcon className={MENU_ICON} />
              Account settings
            </Link>
            <Link
              href="/sessions"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              <SessionsIcon className={MENU_ICON} />
              Session monitoring
            </Link>
          </div>

          <form action={signOutAction} className="border-t border-gray-100">
            <button
              type="submit"
              role="menuitem"
              onClick={() => sessionStorage.removeItem(FP_CACHE_KEY)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              <SignOutIcon className={MENU_ICON} />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
