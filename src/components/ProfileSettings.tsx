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
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setFpMode(
      (localStorage.getItem(FP_MODE_KEY) as FpMode) || "oss",
    )
    setModel(
      localStorage.getItem(MODEL_KEY) || "claude-sonnet-4-6",
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
    <div className="mt-6 max-w-md space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      {/* Fingerprint Mode */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-gray-900">
          Fingerprint Mode
        </p>
        <p className="mb-3 text-xs text-gray-500">
          Open source mode works without an API key but produces less stable
          fingerprints.
        </p>
        <div className="flex gap-2">
          {(["pro", "oss"] as const).map((mode) => (
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
      </div>

      {/* Claude Model */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-gray-900">Claude Model</p>
        <p className="mb-3 text-xs text-gray-500">
          {MODEL_PICKER_ENABLED
            ? "Which model analyzes detection events."
            : "Model selection is disabled in this environment."}
        </p>
        <select
          value={MODEL_PICKER_ENABLED ? model : "claude-haiku-4-5"}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!MODEL_PICKER_ENABLED}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${
            MODEL_PICKER_ENABLED
              ? "bg-white text-gray-900"
              : "cursor-not-allowed bg-gray-100 text-gray-400"
          }`}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
