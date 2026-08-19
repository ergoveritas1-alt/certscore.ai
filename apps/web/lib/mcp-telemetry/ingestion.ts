import { createHmac, timingSafeEqual } from "node:crypto";
import { mcpTelemetryEventSchema, type McpTelemetryEvent } from "@website-signal-risk-scanner/shared";

const MAX_CLOCK_SKEW_SECONDS = 300;

function safeEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyMcpTelemetryEnvelope(input: {
  body: string;
  nowMs?: number;
  proof: string | null;
  secret: string | null;
  timestamp: string | null;
}): { event: McpTelemetryEvent; ok: true } | { ok: false; reason: string } {
  if (!input.secret || !input.proof || !input.timestamp || !/^\d{1,12}$/.test(input.timestamp)) {
    return { ok: false, reason: "missing_or_invalid_authentication" };
  }
  const nowMs = input.nowMs ?? Date.now();
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(nowMs / 1_000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "stale_authentication" };
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`, "utf8")
    .digest("base64url");
  if (!safeEqual(expected, input.proof)) {
    return { ok: false, reason: "invalid_authentication" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const event = mcpTelemetryEventSchema.safeParse(parsed);
  if (!event.success) {
    return { ok: false, reason: "invalid_event" };
  }
  if (Math.abs(Date.parse(event.data.occurredAt) - nowMs) > MAX_CLOCK_SKEW_SECONDS * 1_000) {
    return { ok: false, reason: "invalid_occurred_at" };
  }
  return { event: event.data, ok: true };
}
