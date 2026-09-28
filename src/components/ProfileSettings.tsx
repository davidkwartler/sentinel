"use client"

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
  FP_PRO_STATUS_KEY,
  MODEL_KEY,
  MODEL_OPTIONS,
  THRESHOLD_KEY,
} from "@/lib/settings"
import type { ProFailureReason } from "@/components/FingerprintReporter"
import {
  useFlagThreshold,
  useIsClient,
  useStorageValue,
  writeStorage,
} from "@/lib/use-browser-storage"

const PRO_FAILURE_LABEL: Record<ProFailureReason, string> = {
  no_key: "not configured",
  load_failed: "unavailable in this browser (often an ad blocker)",
  get_failed: "failed to respond",
}

type FpMode = "pro" | "oss"

const MODEL_PICKER_ENABLED =
  process.env.NEXT_PUBLIC_MODEL_PICKER_ENABLED === "true"
const THRESHOLD_PICKER_ENABLED =
  process.env.NEXT_PUBLIC_THRESHOLD_PICKER_ENABLED === "true"

export function ProfileSettings() {
  // Same default logic as FingerprintReporter: Pro when an API key is configured.
  const fpMode = ((useStorageValue(FP_MODE_KEY) as FpMode | null) ||
    (process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ? "pro" : "oss")) as FpMode
  // Set by FingerprintReporter's most recent capture attempt on this tab —
  // this is where someone would go to act on "Pro selected but unavailable".
  const proStatus = useStorageValue(FP_PRO_STATUS_KEY, "session") as ProFailureReason | null
  const storedModel = useStorageValue(MODEL_KEY)
  const model = MODEL_PICKER_ENABLED ? storedModel || DEFAULT_MODEL : DEFAULT_MODEL
  const threshold = useFlagThreshold()
  // Every value above comes from browser storage, so render nothing until the
  // client can read it rather than flashing the defaults first.
  const mounted = useIsClient()

  function handleFpModeChange(mode: FpMode) {
    writeStorage(FP_MODE_KEY, mode)
    // Clear fingerprint cache so next page load re-fingerprints
    writeStorage(FP_CACHE_KEY, null, "session")
  }

  function handleModelChange(value: string) {
    writeStorage(MODEL_KEY, value)
  }

  function handleThresholdChange(value: number) {
    writeStorage(THRESHOLD_KEY, String(clampThreshold(value)))
  }

  if (!mounted) return null

  const analysisOff = model === ANALYSIS_OFF

  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
      <Row
        label="Fingerprint source"
        info="How each device is identified. Pro uses FingerprintJS Pro for higher accuracy and lets the server verify what the browser reports. OSS uses the open-source agent, which is less stable across sessions. Defaults to Pro when an API key is configured."
        note={
          fpMode === "pro" && proStatus && proStatus !== "no_key"
            ? `Pro ${PRO_FAILURE_LABEL[proStatus]} — falling back to OSS.`
            : undefined
        }
      >
        <SegmentedControl
          options={[
            { value: "oss", label: "OSS" },
            { value: "pro", label: "Pro" },
          ]}
          label="Fingerprint source"
          value={fpMode}
          onChange={(v) => handleFpModeChange(v as FpMode)}
        />
      </Row>

      <Row
        label="Analysis model"
        info="Claude reviews every fingerprint mismatch and scores how likely it is to be a hijack rather than the same person on a new browser. Larger models reason more carefully and cost more. Off skips analysis entirely and flags every mismatch."
        note={MODEL_PICKER_ENABLED ? undefined : "Model selection locked."}
      >
        <SegmentedControl
          options={MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          label="Analysis model"
          value={model}
          onChange={handleModelChange}
          disabled={!MODEL_PICKER_ENABLED}
        />
      </Row>

      <Row
        label="Flag threshold"
        info={`Sessions scoring at or above this are flagged. Lower catches more hijacks and more false alarms. Default ${DEFAULT_FLAG_THRESHOLD}, minimum ${MIN_FLAG_THRESHOLD}.`}
        note={
          analysisOff
            ? "Unused while analysis is off."
            : !THRESHOLD_PICKER_ENABLED
              ? "Threshold locked."
              : undefined
        }
      >
        <div
          className={`flex items-center gap-3 ${
            analysisOff || !THRESHOLD_PICKER_ENABLED ? "opacity-50" : ""
          }`}
        >
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
            disabled={analysisOff || !THRESHOLD_PICKER_ENABLED}
            onChange={(e) => handleThresholdChange(Number(e.target.value))}
            aria-label="Flag threshold"
            className="w-40 accent-violet-600 sm:w-48"
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
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
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
  label,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[]
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex rounded-md border border-gray-300 bg-gray-100 p-0.5 ${
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
            className={`rounded px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1 ${
              // Violet means interactive, so a locked control shouldn't wear
              // it — a violet fill at 60% opacity still read as "this is
              // selectable and selected". Grey says "this is the value, and
              // you can't change it".
              selected
                ? disabled
                  ? "bg-gray-500 text-white shadow-sm"
                  : "bg-violet-600 text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-200 hover:text-gray-900"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
