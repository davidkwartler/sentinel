"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ProductsIcon, SessionsIcon, SignOutIcon, UserIcon } from "@/components/icons"
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
  const menuRef = useRef<HTMLDivElement>(null)

  // Hover-to-open, for mice and trackpads only (touch and keyboard use the
  // click). A short delay before opening keeps a pass across the header from
  // flashing the menu; a grace period before closing lets the pointer cross
  // the gap into the panel. With a mouse, clicking the button only ever opens
  // or pins the menu; it never collapses it out from under the pointer.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openedByHover = useRef(false)
  const canHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches

  function clearHoverTimer() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  function onPointerEnter() {
    if (!canHover()) return
    clearHoverTimer()
    hoverTimer.current = setTimeout(() => {
      setOpen((wasOpen) => {
        if (!wasOpen) openedByHover.current = true
        return true
      })
    }, 80)
  }
  function onPointerLeave() {
    if (!canHover()) return
    clearHoverTimer()
    hoverTimer.current = setTimeout(() => {
      if (openedByHover.current) setOpen(false)
    }, 220)
  }
  function onTriggerClick() {
    clearHoverTimer()
    if (canHover()) {
      openedByHover.current = false // pin it: leaving no longer closes
      setOpen(true)
      return
    }
    openedByHover.current = false
    setOpen((v) => !v)
  }
  useEffect(() => clearHoverTimer, [])

  useEffect(() => {
    if (!open) {
      openedByHover.current = false
      return
    }

    // role="menu" promises the menu keyboard model: focus moves into the menu
    // on open, arrows move between items, Tab leaves and closes it.
    const items = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    // A menu opened by pointing shouldn't pull focus out from under the page.
    if (!openedByHover.current) items()[0]?.focus()

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key === "Tab") {
        setOpen(false)
        return
      }
      const list = items()
      if (list.length === 0) return
      const current = list.indexOf(document.activeElement as HTMLElement)
      const next =
        event.key === "ArrowDown"
          ? (current + 1) % list.length
          : event.key === "ArrowUp"
            ? (current - 1 + list.length) % list.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? list.length - 1
                : null
      if (next !== null) {
        event.preventDefault()
        list[next].focus()
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
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">
      {name?.[0] ?? "?"}
    </div>
  )

  return (
    <div
      className="relative"
      ref={containerRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={onTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-white/25 py-1 pl-1 pr-2.5 transition-colors hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        {avatar}
        <span className="hidden text-sm text-gray-100 sm:inline">Account</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
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
          ref={menuRef}
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

          {/* Every page, by the same names as the header: on phones the header
              links are icon-only, so this is where the pages are spelled out. */}
          <div className="py-1">
            <Link
              href="/products"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              <ProductsIcon className={MENU_ICON} />
              Products
            </Link>
            <Link
              href="/sessions"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              <SessionsIcon className={MENU_ICON} />
              Sessions
            </Link>
            <Link
              href="/account"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              <UserIcon className={MENU_ICON} />
              Account
            </Link>
          </div>

          <form action={signOutAction} className="border-t border-gray-100">
            <button
              type="submit"
              role="menuitem"
              tabIndex={-1}
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
