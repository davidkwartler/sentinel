import Link from "next/link"
import {
  GitHubIcon,
  LinkedInIcon,
  ProductsIcon,
  SessionsIcon,
  UserIcon,
} from "@/components/icons"

const ICON = "h-3.5 w-3.5"

// Icons carry the row; the label unfurls to the right on hover or keyboard
// focus. The label stays in the DOM as the link's accessible name — screen
// readers and crawlers read "Account", not an unlabelled icon.
const linkClass =
  "group flex items-center text-gray-500 transition-colors hover:text-gray-900 focus-visible:text-gray-900 focus-visible:outline-none"

// The reveal animates grid-template-columns 0fr -> 1fr rather than max-width.
// max-width has to overshoot the real text width, so the tail of every
// transition ran on empty space and the labels arrived at visibly different
// speeds. A fr track interpolates the content's own width, so the motion is
// uniform and stops exactly when the text ends. Paired with a decelerating
// ease so it settles rather than halts.
const revealClass =
  "grid grid-cols-[0fr] opacity-0 transition-all duration-[600ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:ml-1.5 group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:grid-cols-[1fr] group-focus-visible:opacity-100 motion-reduce:transition-none"

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className={revealClass}>
      <span className="overflow-hidden whitespace-nowrap">{children}</span>
    </span>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      {/* Icons left, copyright right, pushed apart by justify-between. The
          strip is flex-nowrap so it stays one line and only the copyright
          drops below it on a phone — where the column centres both. */}
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-y-2 px-6 py-4 text-xs sm:flex-row">
        <div className="flex flex-nowrap items-center gap-x-4">
          <Link href="/products" className={linkClass}>
            <ProductsIcon className={ICON} />
            <Label>Products</Label>
          </Link>
          <Link href="/account" className={linkClass}>
            <UserIcon className={ICON} />
            <Label>Account</Label>
          </Link>
          <Link href="/sessions" className={linkClass}>
            <SessionsIcon className={ICON} />
            <Label>Sessions</Label>
          </Link>
          <a
            href="https://www.linkedin.com/in/dkwartler/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <LinkedInIcon className={ICON} />
            <Label>LinkedIn</Label>
          </a>
          <a
            href="https://github.com/davidkwartler/sentinel"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <GitHubIcon className={ICON} />
            <Label>GitHub</Label>
          </a>
        </div>

        <p className="whitespace-nowrap text-gray-500">
          {/* No "All rights reserved" — the repo is MIT licensed, and the
              phrase claims the opposite of what LICENSE grants. */}
          &copy; {new Date().getFullYear()} David Kwartler
        </p>
      </div>
    </footer>
  )
}
