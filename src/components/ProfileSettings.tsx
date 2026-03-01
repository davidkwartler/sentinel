"use client"

import { useEffect, useState } from "react"

const FP_MODE_KEY = "sentinel_fp_mode"
const MODEL_KEY = "sentinel_claude_model"
const FP_CACHE_KEY = "sentinel_fp_sent"

type FpMode = "pro" | "oss"

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
] as const

const MODEL_PICKER_ENABLED =
  process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"

export function ProfileSettings() {
  const [fpMode, setFpMode] = useState<FpMode>("oss")
  const [model, setModel] = useState("claude-haiku-4-5")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setFpMode(
      (localStorage.getItem(FP_MODE_KEY) as FpMode) || "oss",
    )
    setModel(
      MODEL_PICKER_ENABLED
        ? localStorage.getItem(MODEL_KEY) || "claude-haiku-4-5"
        : "claude-haiku-4-5",
    )
    setMounted(true)
  }, [])

  function handleFpModeChange(mode: FpMode) {
    setFpMode(mode)
    localStorage.setItem(FP_MODE_KEY, mode)
    // Clear fingerprint cache so next page load re-fingerprints
    sessionStorage.removeItem(FP_CACHE_KEY)
  }

  function handleModelChange(value: string) {
    setModel(value)
    localStorage.setItem(MODEL_KEY, value)
  }

  if (!mounted) return null

  return (
    <div className="space-y-4">
      {/* Fingerprint Mode */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-gray-900">
          Device Fingerprinting
        </p>
        <p className="mb-3 text-xs text-gray-500">
          Identifies unique devices accessing the product page, so we can
          detect suspicious session activity.
        </p>
        <div className="flex gap-2">
          {(["oss", "pro"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleFpModeChange(mode)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                fpMode === mode
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {mode === "pro" ? "Pro" : "Open Source"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-gray-400">
          FingerprintJS open source by default, use Pro with an API key for
          improved accuracy.
        </p>
      </div>

      {/* Claude Model */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-gray-900">GenAI Analysis</p>
        <p className="mb-3 text-xs text-gray-500">
          Reviews fingerprint mismatches and determines if a session hijack
          has occurred.
        </p>
        <div className="flex gap-2">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => MODEL_PICKER_ENABLED && handleModelChange(opt.value)}
              disabled={!MODEL_PICKER_ENABLED}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                MODEL_PICKER_ENABLED
                  ? model === opt.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  : model === opt.value
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "cursor-not-allowed bg-gray-50 text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-gray-400">
          Claude Haiku by default, use Opus for best results.
          {!MODEL_PICKER_ENABLED && " Model selection is disabled in this environment."}
        </p>
      </div>
    </div>
  )
}
