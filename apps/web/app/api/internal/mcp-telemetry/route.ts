import { NextResponse } from "next/server";
import { verifyMcpTelemetryEnvelope } from "../../../../lib/mcp-telemetry/ingestion";
import { persistMcpTelemetryEvent } from "../../../../server/mcp-telemetry/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function telemetrySecret() {
  return process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim()
    || process.env.JWT_SIGNING_KEY?.trim()
    || null;
}

export async function POST(request: Request) {
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
    await persistMcpTelemetryEvent(verified.event);
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp.telemetry_persistence_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      surface: verified.event.surface,
      toolName: verified.event.toolName,
    }));
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}
