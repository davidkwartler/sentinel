import Image from "next/image"
import { DevicesIcon, FingerprintIcon, FlagIcon } from "@/components/icons"

// The card body is shared by /login and the dismissible modal on /products so
// the two can't drift — they were identical markup in two files.

// The mark is Google's own asset, served from /public rather than redrawn as
// inline SVG. Their branding guidelines forbid altering the G's colour, and
// the current standard version is a gradient that a hand-authored copy can
// only approximate. Height is fixed and width follows the file's 200x204
// ratio so the logo is never distorted, which the guidelines also require.
export function GoogleSignInButton({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1"
      >
        <Image
          src="/google-g.png"
          alt=""
          width={200}
          height={204}
          className="h-5 w-auto shrink-0"
          unoptimized
        />
        Sign in with Google
      </button>
    </form>
  )
}

// Each step gets the icon of the thing it produces: a fingerprint, the
// multi-device mismatch, the flag. The steps stay numbered — the icons say
// what happens, the numbers say in what order, and dropping them left three
// unrelated glyphs with no sequence.
//
// Layout: number and icon sit in their own columns rather than stacked, which
// is what let the old badge clip the glyph. The number gets the circle's exact
// height and centres inside it, so alignment survives a font or size change;
// padding nudges did not. The rail spans circle-bottom to the next circle,
// crossing the row gap, so it can't fall short when a step wraps to a
// different number of lines.
const STEPS = [
  {
    Icon: FingerprintIcon,
    text: "Sign in and browse. Sentinel records a fingerprint for your device.",
  },
  {
    Icon: DevicesIcon,
    text: "A second device on the same session triggers a fingerprint mismatch.",
  },
  {
    Icon: FlagIcon,
    text: "Claude scores the mismatch and flags it if it looks like a hijack.",
  },
]

export function HowItWorks() {
  return (
    <div className="mt-8 border-t border-gray-100 pt-6">
      <p className="mb-4 text-center text-xs font-medium text-gray-700">
        How it works
      </p>
      <ol className="space-y-3">
        {STEPS.map(({ Icon, text }, i) => (
          <li key={i} className="flex items-stretch gap-2.5">
            <span className="flex h-8 w-3 shrink-0 items-center justify-end text-[11px] font-medium tabular-nums text-gray-500">
              {i + 1}
            </span>
            {/* Decorative: the glyph and rail restate the text, so a screen
                reader gets the ordered list and nothing else. */}
            <span aria-hidden="true" className="relative flex flex-col items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <Icon className="h-4 w-4" />
              </span>
              {i < STEPS.length - 1 && (
                <span className="absolute top-8 -bottom-3 w-px bg-gray-200" />
              )}
            </span>
            <p className="text-xs leading-relaxed text-gray-600">{text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
