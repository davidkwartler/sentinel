"use client"

import { useEffect, useRef, useState } from "react"

// Explanatory copy that would otherwise sit under every setting as permanent
// subtext. Click to open rather than hover, so it works on touch and doesn't
// fire while the pointer crosses the row.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
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

  return (
    <span className="relative inline-flex" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`About ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        i
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  )
}
