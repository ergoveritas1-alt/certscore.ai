import "server-only";
import type { FullSiteReportFrame } from "../../lib/scans/full-site-report-stream";
import type { FullSiteReportOverview, FullSiteReportResponse } from "./full-site-report";

export function streamFullSiteReport(
  load: (onOverview: (overview: FullSiteReportOverview) => void) => Promise<FullSiteReportResponse | null>,
) {
  const start = performance.now();
  const encoder = new TextEncoder();
  let cancelled = false;
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: FullSiteReportFrame) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };
      try {
        const report = await load(data => send({ type: "overview", data, elapsedMs: Math.round(performance.now() - start) }));
        if (report) {
          // These fields were already delivered; do not transmit large score evidence twice.
          const { score, summary, finalizationStartedAt, ...details } = report;
          send({ type: "report", data: details, elapsedMs: Math.round(performance.now() - start) });
        }
        else send({ type: "error", message: "Report is unavailable. Please retry." });
      } catch {
        send({ type: "error", message: "Supporting details could not be loaded. Please retry." });
      } finally { if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; },
  }), { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  } });
}
