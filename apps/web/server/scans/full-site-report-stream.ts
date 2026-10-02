import "server-only";
import { createGzip, constants } from "node:zlib";
import { Readable } from "node:stream";
import type { FullSiteReportFrame } from "../../lib/scans/full-site-report-stream";
import type { FullSiteReportOverview, FullSiteReportResponse, FullSiteReportSupporting } from "./full-site-report";

export function streamFullSiteReport(
  load: (onOverview: (overview: FullSiteReportOverview) => void, onSupporting: (supporting: FullSiteReportSupporting) => void) => Promise<FullSiteReportResponse | null>,
  gzip = false,
) {
  const start = performance.now();
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: FullSiteReportFrame) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };
      try {
        const report = await load(
          data => send({ type: "overview", data, elapsedMs: Math.round(performance.now() - start) }),
          data => send({ type: "supporting", data, elapsedMs: Math.round(performance.now() - start) }),
        );
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
  });
  // Flush every frame so compression cannot buffer a small overview until details finish.
  let body = stream;
  if (gzip) {
    const source = Readable.fromWeb(stream as import("node:stream/web").ReadableStream<Uint8Array>);
    const compressed = createGzip({ flush: constants.Z_SYNC_FLUSH });
    source.on("error", error => compressed.destroy(error));
    compressed.on("close", () => source.destroy());
    body = Readable.toWeb(source.pipe(compressed)) as ReadableStream<Uint8Array>;
  }
  return new Response(body, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Accept-Encoding",
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
  } });
}
