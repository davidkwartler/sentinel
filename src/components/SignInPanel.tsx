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
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <div className="space-y-3">
        {STEPS.map(({ Icon, text }, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Icon className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-900 text-[9px] font-medium text-white">
                {i + 1}
              </span>
            </span>
            <p className="pt-1 text-xs leading-relaxed text-gray-500">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
