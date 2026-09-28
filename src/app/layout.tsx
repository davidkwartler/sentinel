import type { Metadata } from "next"
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Footer } from "@/components/Footer"
import "./globals.css"

// Exposed as CSS variables; globals.css maps them onto Tailwind's font-sans
// and font-mono so every utility picks them up.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "Sentinel",
  description: "Session hijack detection",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      {/* Column layout so the footer sits at the bottom of short pages
          instead of floating mid-viewport. */}
      <body className={`${jakarta.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans antialiased`}>
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
