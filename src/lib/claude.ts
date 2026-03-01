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
      "You are given two browser fingerprints recorded against the SAME session cookie. " +
      "The original fingerprint was captured when the user first authenticated. " +
      "The new fingerprint was captured from a subsequent request using that same session cookie.\n\n" +
      "KEY CONCEPT: A legitimate user who logs in on multiple devices gets a separate session cookie " +
      "per device. A single session cookie appearing on two different physical devices means the cookie " +
      "was stolen and replayed — that is a session hijack. Do NOT flag 'using multiple devices' as " +
      "suspicious on its own; what matters is that ONE cookie is being used from different devices.\n\n" +
      "FALSE POSITIVES TO WATCH FOR:\n" +
      "- Incognito/private browsing on the same device: produces a different visitor ID but shares " +
      "the same OS, browser, screen resolution, timezone, and usually the same IP.\n" +
      "- Browser updates or extension changes: may shift the visitor ID but device characteristics stay the same.\n" +
      "- VPN or DHCP changes: IP changes but all device characteristics remain identical.\n\n" +
      "STRONG HIJACK INDICATORS:\n" +
      "- Different OS (e.g. Mac OS X → Windows, or Mac OS X → Android)\n" +
      "- Different browser family (e.g. Chrome → Firefox)\n" +
      "- Dramatically different screen resolution indicating a different device class\n" +
      "- Different timezone combined with different IP suggesting geographically distant access\n\n" +
      "Focus on device characteristics, not visitor ID alone.\n\n" +
      "OUTPUT FORMAT:\n" +
      "- Keep reasoning under 400 characters\n" +
      "- Use bullet points (• ) to list key findings\n" +
      "- Be concise and direct — state what changed and what it means\n" +
      "- Lead with the verdict (e.g. 'Likely hijack:' or 'Likely benign:')",
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
              description: "Concise bullet-point explanation, max 400 characters. Use • for bullets.",
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
