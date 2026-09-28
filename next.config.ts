import type { NextConfig } from "next";

// Baseline headers for every route. Deliberately no script-src/connect-src CSP:
// the Fingerprint Pro agent loads from a configurable first-party subdomain
// with Fingerprint's default endpoints as fallback, plus Vercel Analytics and
// Next's inline bootstrap scripts, so an allowlist here would silently break
// fingerprint capture the first time any of those hosts changed. The CSP below
// only restricts framing, which has no such dependency.
const securityHeaders = [
  // Clickjacking: nothing should embed this app, least of all a page that
  // could overlay the sign-in or sessions UI.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
