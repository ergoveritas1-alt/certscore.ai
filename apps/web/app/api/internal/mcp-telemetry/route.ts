import { NextResponse } from "next/server";
import { verifyMcpTelemetryEnvelope } from "../../../../lib/mcp-telemetry/ingestion";
import { persistMcpActivationEvent, persistMcpTelemetryEvent } from "../../../../server/mcp-telemetry/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function telemetrySecret() {
  return process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim()
    || process.env.JWT_SIGNING_KEY?.trim()
    || null;
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const body = await request.text();
  const verified = verifyMcpTelemetryEnvelope({
    body,
    proof: request.headers.get("x-certscore-mcp-telemetry-proof"),
    secret: telemetrySecret(),
    timestamp: request.headers.get("x-certscore-mcp-telemetry-timestamp"),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: "Unauthorized telemetry event." }, { status: 401 });
  }

  try {
    if (verified.kind === "activation") {
      await persistMcpActivationEvent(verified.event);
    } else {
      await persistMcpTelemetryEvent(verified.event);
    }
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= 1_000) {
      console.warn(JSON.stringify({
        durationMs,
        event: "mcp.telemetry_persistence_slow",
        eventId: verified.event.eventId,
        kind: verified.kind,
        stage: verified.kind === "activation" ? verified.event.stage : null,
        surface: verified.kind === "tool_invocation" ? verified.event.surface : "mcp_authenticated",
        toolName: verified.kind === "tool_invocation" ? verified.event.toolName : null,
      }));
    }
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp.telemetry_persistence_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      kind: verified.kind,
      stage: verified.kind === "activation" ? verified.event.stage : null,
      surface: verified.kind === "tool_invocation" ? verified.event.surface : "mcp_authenticated",
      toolName: verified.kind === "tool_invocation" ? verified.event.toolName : null,
    }));
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}
