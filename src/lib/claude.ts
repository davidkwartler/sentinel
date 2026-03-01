import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function analyzeDetectionEvent(eventId: string, modelOverride?: string): Promise<void> {
  const event = await prisma.detectionEvent.findUnique({ where: { id: eventId } })
  if (!event) return

  const model = modelOverride ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5"

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system:
      "You are a security analysis system. Given two browser fingerprints from the same session, " +
      "determine the likelihood that the second access is a session hijack attempt. " +
      "Return a confidence score from 0 (definitely legitimate) to 100 (definitely a hijack).",
    messages: [
      {
        role: "user",
        content:
          `Session ID: ${event.sessionId}\n` +
          `Original visitor ID: ${event.originalVisitorId} (IP: ${event.originalIp ?? "unknown"})\n` +
          `New visitor ID: ${event.newVisitorId} (IP: ${event.newIp ?? "unknown"})\n` +
          `Component similarity score: ${event.similarityScore.toFixed(2)} (0=different, 1=identical)\n\n` +
          "Analyze whether this represents a session hijack.",
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
              minimum: 0,
              maximum: 100,
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
