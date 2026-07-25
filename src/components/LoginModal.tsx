"use client"

import { useState, useEffect } from "react"
import { ShieldIcon } from "@/components/icons"
import { GoogleSignInButton, HowItWorks } from "@/components/SignInPanel"

const DISMISSED_KEY = "sentinel_login_dismissed"

export function LoginModal({ signInAction }: { signInAction: () => void }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(DISMISSED_KEY)) {
      setShow(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1")
    setShow(false)
  }

  if (!show) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in to Sentinel" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-black/40">
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
        <h1 className="mb-2 flex items-center justify-center gap-2.5 text-center text-2xl font-semibold leading-none text-gray-900">
          <ShieldIcon className="h-8 w-8" outlined />
          Sentinel
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Session hijack detection demo
        </p>
        <GoogleSignInButton action={signInAction} />
        <HowItWorks />
      </div>
    </div>
  )
}
