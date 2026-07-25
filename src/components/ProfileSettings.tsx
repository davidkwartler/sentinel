"use client"

import { useEffect, useState } from "react"

import {
  ANALYSIS_OFF,
  clampThreshold,
  DEFAULT_FLAG_THRESHOLD,
  MAX_FLAG_THRESHOLD,
  MIN_FLAG_THRESHOLD,
  DEFAULT_MODEL,
  FP_CACHE_KEY,
  FP_MODE_KEY,
  MODEL_KEY,
  MODEL_OPTIONS,
  THRESHOLD_KEY,
} from "@/lib/settings"

type FpMode = "pro" | "oss"

const MODEL_PICKER_ENABLED =
  process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"

export function ProfileSettings() {
  const [fpMode, setFpMode] = useState<FpMode>("oss")
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [threshold, setThreshold] = useState(DEFAULT_FLAG_THRESHOLD)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setFpMode(
      // Same default logic as FingerprintReporter: Pro when an API key is configured
      (localStorage.getItem(FP_MODE_KEY) as FpMode) ||
        (process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ? "pro" : "oss"),
    )
    setModel(
      MODEL_PICKER_ENABLED
        ? localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL
        : DEFAULT_MODEL,
    )
    // Clamp on read as well as write — a value stored before the floor existed
    // would otherwise leave the slider out of range.
    const storedThreshold = Number(localStorage.getItem(THRESHOLD_KEY))
    if (localStorage.getItem(THRESHOLD_KEY) !== null && Number.isFinite(storedThreshold)) {
      setThreshold(clampThreshold(storedThreshold))
    }
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

  function handleThresholdChange(value: number) {
    const clamped = clampThreshold(value)
    setThreshold(clamped)
    localStorage.setItem(THRESHOLD_KEY, String(clamped))
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
              aria-pressed={fpMode === mode}
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
          Defaults to FingerprintJS Pro when an API key is configured for
          improved accuracy; falls back to open source otherwise.
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
              aria-pressed={model === opt.value}
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
          Claude Haiku by default, use Opus for best results. Off skips GenAI
          analysis and flags on fingerprint mismatch alone.
          {!MODEL_PICKER_ENABLED && " Model selection is disabled in this environment."}
        </p>

        {/* Flag Threshold */}
        <div className={`mt-4 border-t border-gray-100 pt-4 ${model === ANALYSIS_OFF ? "opacity-50" : ""}`}>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Flag Threshold</p>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
              {threshold}
            </span>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Detection events with a confidence score at or above this value are
            flagged.
          </p>
          <input
            type="range"
            min={MIN_FLAG_THRESHOLD}
            max={MAX_FLAG_THRESHOLD}
            step={5}
            value={threshold}
            disabled={model === ANALYSIS_OFF}
            onChange={(e) => handleThresholdChange(Number(e.target.value))}
            aria-label="Flag threshold"
            className="w-full accent-gray-900"
          />
          <p className="mt-2 text-[11px] italic text-gray-400">
            Defaults to {DEFAULT_FLAG_THRESHOLD}; adjust higher or lower based
            on your security posture. Won&apos;t go below {MIN_FLAG_THRESHOLD},
            where every mismatch would flag regardless of the score.
            {model === ANALYSIS_OFF && " Not used while GenAI analysis is off."}
          </p>
        </div>
      </div>
    </div>
  )
}
