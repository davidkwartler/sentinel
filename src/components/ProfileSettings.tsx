"use client"

import { useEffect, useState } from "react"

import { InfoTip } from "@/components/InfoTip"
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

  const analysisOff = model === ANALYSIS_OFF

  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
      <Row
        label="Fingerprint source"
        info="How each device is identified. Pro uses FingerprintJS Pro for higher accuracy and lets the server verify what the browser reports. OSS uses the open-source agent, which is less stable across sessions. Defaults to Pro when an API key is configured."
      >
        <SegmentedControl
          options={[
            { value: "oss", label: "OSS" },
            { value: "pro", label: "Pro" },
          ]}
          value={fpMode}
          onChange={(v) => handleFpModeChange(v as FpMode)}
        />
      </Row>

      <Row
        label="Analysis model"
        info="Claude reviews every fingerprint mismatch and scores how likely it is to be a hijack rather than the same person on a new browser. Larger models reason more carefully and cost more. Off skips analysis entirely and flags every mismatch."
        note={
          MODEL_PICKER_ENABLED ? undefined : "Disabled in this environment."
        }
      >
        <SegmentedControl
          options={MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={model}
          onChange={handleModelChange}
          disabled={!MODEL_PICKER_ENABLED}
        />
      </Row>

      <Row
        label="Flag threshold"
        info={`Sessions scoring at or above this are flagged. Lower catches more hijacks and more false alarms. Default ${DEFAULT_FLAG_THRESHOLD}, minimum ${MIN_FLAG_THRESHOLD}.`}
        note={analysisOff ? "Unused while analysis is off." : undefined}
      >
        <div className={`flex items-center gap-3 ${analysisOff ? "opacity-50" : ""}`}>
          {/* Track spans the full 0–100 so the thumb sits where the number
              actually falls; handleThresholdChange clamps a drag below the
              floor back up to it. Setting min={MIN_FLAG_THRESHOLD} would park
              20 at the far left, reading as zero. */}
          <input
            type="range"
            min={0}
            max={MAX_FLAG_THRESHOLD}
            step={5}
            value={threshold}
            disabled={analysisOff}
            onChange={(e) => handleThresholdChange(Number(e.target.value))}
            aria-label="Flag threshold"
            className="w-40 accent-gray-900 sm:w-48"
          />
          <span className="w-7 text-right text-sm font-medium tabular-nums text-gray-900">
            {threshold}
          </span>
        </div>
      </Row>
    </div>
  )
}

function Row({
  label,
  info,
  note,
  children,
}: {
  label: string
  info: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <InfoTip label={label}>{info}</InfoTip>
        {note && <span className="ml-1 text-xs text-gray-500">{note}</span>}
      </div>
      {children}
    </div>
  )
}

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div
      className={`inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            aria-pressed={selected}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
