import { NextResponse } from "next/server";

function boundedNumber(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const scanId = typeof payload.scanId === "string" && /^[0-9a-f-]{32,36}$/i.test(payload.scanId)
      ? payload.scanId
      : null;
    const event = payload.event === "terminal_detected" || payload.event === "report_visible"
      ? payload.event
      : null;
    if (scanId && event) {
      console.info(JSON.stringify({
        duplicatePollsPrevented: boundedNumber(payload.duplicatePollsPrevented, 10_000),
        durationMs: boundedNumber(payload.durationMs, 600_000),
        event: `scan.progress_${event}`,
        pollCount: boundedNumber(payload.pollCount, 10_000),
        scanId,
      }));
    }
  } catch {
    // Best-effort operational telemetry only.
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
