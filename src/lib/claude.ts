import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

function formatFingerprint(fp: {
  visitorId: string
  ip: string | null
  os: string | null
  browser: string | null
  screenRes: string | null
  timezone: string | null
  userAgent: string | null
}) {
  return [
    `  Visitor ID: ${fp.visitorId}`,
    `  IP: ${fp.ip ?? "unknown"}`,
    `  OS: ${fp.os ?? "unknown"}`,
    `  Browser: ${fp.browser ?? "unknown"}`,
    `  Screen Resolution: ${fp.screenRes ?? "unknown"}`,
    `  Timezone: ${fp.timezone ?? "unknown"}`,
    `  User-Agent: ${fp.userAgent ?? "unknown"}`,
  ].join("\n")
}

export async function analyzeDetectionEvent(eventId: string, modelOverride?: string): Promise<void> {
  const event = await prisma.detectionEvent.findUnique({
    where: { id: eventId },
    include: {
      session: {
        include: {
          fingerprints: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  })
  if (!event) return

  const original = event.session.fingerprints.find((fp) => fp.isOriginal)
  const newest = event.session.fingerprints.find(
    (fp) => fp.visitorId === event.newVisitorId,
  )

  const model = modelOverride ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5"

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system:
      "You are a security analysis system that detects session hijacking. " +
      "You are given the original browser fingerprint that established a session and a new fingerprint " +
      "that just accessed the same session. Compare the raw device characteristics to determine " +
      "whether this is a legitimate user (e.g. same device in incognito mode, browser update, VPN change) " +
      "or a genuine session hijack (e.g. stolen cookie replayed from a different device/location). " +
      "Be aware that incognito/private browsing on the same device will produce a different visitor ID " +
      "but will share the same OS, browser, screen resolution, timezone, and often IP address. " +
      "Focus on meaningful differences like OS, browser, timezone, and geographic IP changes rather than " +
      "visitor ID alone.",
    messages: [
      {
        role: "user",
        content:
          `ORIGINAL FINGERPRINT (established the session):\n` +
          (original ? formatFingerprint(original) : `  Visitor ID: ${event.originalVisitorId}\n  IP: ${event.originalIp ?? "unknown"}`) +
          `\n\nNEW FINGERPRINT (accessing the same session):\n` +
          (newest ? formatFingerprint(newest) : `  Visitor ID: ${event.newVisitorId}\n  IP: ${event.newIp ?? "unknown"}`) +
          `\n\nComponent similarity score: ${event.similarityScore.toFixed(2)} (0=completely different, 1=identical)\n\n` +
          "Analyze whether this represents a session hijack or a false positive (e.g. incognito browsing, fingerprint drift).",
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            confidenceScore: {
              type: "integer",
              description: "0 = definitely not a hijack, 100 = definitely a hijack",
            },
            reasoning: {
              type: "string",
              description: "Human-readable explanation of the confidence score",
            },
          },
          required: ["confidenceScore", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  })

  if (response.content[0].type !== "text") {
    throw new Error(`Unexpected Claude response type: ${response.content[0].type}`)
  }

  const result = JSON.parse(response.content[0].text) as {
    confidenceScore: number
    reasoning: string
  }

  await prisma.detectionEvent.update({
    where: { id: eventId },
    data: {
      confidenceScore: result.confidenceScore,
      reasoning: result.reasoning,
      status: result.confidenceScore >= 70 ? "FLAGGED" : "CLEAR",
    },
  })
}
