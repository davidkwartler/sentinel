"use client"

import { useEffect, useRef } from "react"
import { ShieldIcon } from "@/components/icons"
import { GoogleSignInButton, HowItWorks } from "@/components/SignInPanel"
import { useIsClient, useStorageValue, writeStorage } from "@/lib/use-browser-storage"

const DISMISSED_KEY = "sentinel_login_dismissed"

export function LoginModal({ signInAction }: { signInAction: () => void }) {
  const dismissed = useStorageValue(DISMISSED_KEY) !== null
  const show = useIsClient() && !dismissed
  const dialogRef = useRef<HTMLDialogElement>(null)

  // showModal() rather than a styled div: the browser supplies the focus
  // trap, Escape to close, an inert background, and focus return on close.
  useEffect(() => {
    const dialog = dialogRef.current
    if (show && dialog && !dialog.open) dialog.showModal()
  }, [show])

  function dismiss() {
    writeStorage(DISMISSED_KEY, "1")
  }

  if (!show) return null

  return (
    <dialog
      ref={dialogRef}
      aria-label="Sign in to Sentinel"
      // Escape fires "cancel" then "close"; either way the prompt is dismissed.
      onClose={dismiss}
      // A click whose target is the dialog itself landed on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
      className="m-auto w-full max-w-sm bg-transparent p-4 backdrop:bg-black/40"
    >
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
        <button
          onClick={() => dialogRef.current?.close()}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
        <h1 className="mb-2 flex items-center justify-center gap-2.5 text-center text-2xl font-extrabold leading-none tracking-tight text-gray-900">
          <ShieldIcon className="h-8 w-8" outlined />
          Sentinel
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Session hijack detection demo
        </p>
        <GoogleSignInButton action={signInAction} />
        <HowItWorks />
      </div>
    </dialog>
  )
}
