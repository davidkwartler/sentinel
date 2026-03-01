import { config } from "dotenv"
config({ path: ".env.local" })
config({ path: ".env" })

import { PrismaClient } from "../src/generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const user = await prisma.user.findFirst()
  if (!user) {
    console.log("No user found — sign in via Google OAuth first")
    return
  }
  console.log("User:", user.id, user.email)

  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

  // Session 1: FLAGGED — hijack detected with high confidence
  const s1 = await prisma.session.create({
    data: {
      sessionToken: `seed-flagged-${Date.now()}`,
      userId: user.id,
      expires: futureDate,
      fingerprints: {
        create: {
          visitorId: "abc123def456gh",
          requestId: `req-flagged-orig-${Date.now()}`,
          ip: "203.0.113.42",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          os: "Mac OS",
          browser: "Chrome",
          screenRes: "1920x1080",
          timezone: "America/New_York",
          isOriginal: true,
        },
      },
      detectionEvents: {
        create: {
          originalVisitorId: "abc123def456gh",
          newVisitorId: "xyz789qrs012tu",
          originalIp: "203.0.113.42",
          newIp: "198.51.100.77",
          similarityScore: 0.25,
          status: "FLAGGED",
          confidenceScore: 92,
          reasoning:
            "High confidence session hijack detected. The original session was established from a macOS device using Chrome in the America/New_York timezone with IP 203.0.113.42. The new request originates from a completely different visitor ID (xyz789qrs012tu) with a different IP address (198.51.100.77), indicating a different physical device. The low similarity score (0.25) across OS, browser, timezone, and screen resolution strongly suggests the session cookie was stolen and replayed from an unauthorized device. The geographic shift from a US East Coast IP to a European IP range further supports malicious intent.",
        },
      },
    },
  })
  console.log("Created FLAGGED session:", s1.id)

  // Session 2: CLEAR — mismatch detected but Claude determined benign
  const s2 = await prisma.session.create({
    data: {
      sessionToken: `seed-clear-${Date.now()}`,
      userId: user.id,
      expires: futureDate,
      fingerprints: {
        create: {
          visitorId: "mno345pqr678st",
          requestId: `req-clear-orig-${Date.now()}`,
          ip: "192.0.2.10",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15",
          os: "Mac OS",
          browser: "Safari",
          screenRes: "2560x1440",
          timezone: "America/Chicago",
          isOriginal: true,
        },
      },
      detectionEvents: {
        create: {
          originalVisitorId: "mno345pqr678st",
          newVisitorId: "mno345pqr999zz",
          originalIp: "192.0.2.10",
          newIp: "192.0.2.11",
          similarityScore: 0.85,
          status: "CLEAR",
          confidenceScore: 22,
          reasoning:
            "Low confidence of hijack. The visitor ID changed slightly but the OS (Mac OS), browser family (Safari), timezone (America/Chicago), and screen resolution (2560x1440) all match exactly. The IP addresses are in the same /24 subnet, suggesting a DHCP reassignment or VPN reconnect. This pattern is consistent with normal browser fingerprint drift rather than a stolen session cookie.",
        },
      },
    },
  })
  console.log("Created CLEAR session:", s2.id)

  // Session 3: PENDING — mismatch detected, Claude analysis in progress
  const s3 = await prisma.session.create({
    data: {
      sessionToken: `seed-pending-${Date.now()}`,
      userId: user.id,
      expires: futureDate,
      fingerprints: {
        create: {
          visitorId: "jkl901uvw234xy",
          requestId: `req-pending-orig-${Date.now()}`,
          ip: "10.0.0.55",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          os: "Windows",
          browser: "Chrome",
          screenRes: "1366x768",
          timezone: "Europe/London",
          isOriginal: true,
        },
      },
      detectionEvents: {
        create: {
          originalVisitorId: "jkl901uvw234xy",
          newVisitorId: "aaa111bbb222cc",
          originalIp: "10.0.0.55",
          newIp: "172.16.0.99",
          similarityScore: 0.45,
          status: "PENDING",
        },
      },
    },
  })
  console.log("Created PENDING session:", s3.id)

  // Session 4: ACTIVE — normal session, no mismatch detected
  const s4 = await prisma.session.create({
    data: {
      sessionToken: `seed-active-${Date.now()}`,
      userId: user.id,
      expires: futureDate,
      fingerprints: {
        create: {
          visitorId: "def456ghi789jk",
          requestId: `req-active-orig-${Date.now()}`,
          ip: "100.64.0.1",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
          os: "iOS",
          browser: "Safari",
          screenRes: "390x844",
          timezone: "America/Los_Angeles",
          isOriginal: true,
        },
      },
    },
  })
  console.log("Created ACTIVE session:", s4.id)

  // Session 5: Another FLAGGED — different attack pattern
  const s5 = await prisma.session.create({
    data: {
      sessionToken: `seed-flagged2-${Date.now()}`,
      userId: user.id,
      expires: futureDate,
      fingerprints: {
        create: {
          visitorId: "qqq555rrr888ss",
          requestId: `req-flagged2-orig-${Date.now()}`,
          ip: "151.101.1.140",
          userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
          os: "Linux",
          browser: "Chrome",
          screenRes: "1920x1200",
          timezone: "Asia/Tokyo",
          isOriginal: true,
        },
      },
      detectionEvents: {
        create: {
          originalVisitorId: "qqq555rrr888ss",
          newVisitorId: "zzz000www111vv",
          originalIp: "151.101.1.140",
          newIp: "45.33.32.156",
          similarityScore: 0.10,
          status: "FLAGGED",
          confidenceScore: 97,
          reasoning:
            "Very high confidence session hijack. The original session was from a Linux machine in Asia/Tokyo timezone. The new request comes from a completely different visitor ID with a US-based IP address (45.33.32.156). Zero overlap in OS, timezone, or screen resolution. The similarity score of 0.10 is near the minimum, indicating the two fingerprints share almost no characteristics. This is a textbook session cookie theft scenario — the attacker likely obtained the cookie via XSS, network sniffing, or malware and is replaying it from a geographically distant location.",
        },
      },
    },
  })
  console.log("Created FLAGGED session:", s5.id)

  console.log("\nDone! 5 test sessions created (2 FLAGGED, 1 CLEAR, 1 PENDING, 1 ACTIVE)")
  console.log("Refresh /dashboard to see them.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
