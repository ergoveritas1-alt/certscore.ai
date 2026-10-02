import type { FullSiteReportOverview, FullSiteReportResponse, FullSiteReportSupporting } from "../../server/scans/full-site-report";

export type FullSiteReportFrame =
  | { type: "overview"; data: FullSiteReportOverview; elapsedMs: number }
  | { type: "supporting"; data: FullSiteReportSupporting; elapsedMs: number }
  | { type: "report"; data: Omit<FullSiteReportResponse, keyof FullSiteReportOverview>; elapsedMs: number }
  | { type: "error"; message: string };

/** One request delivers the saved overview before the slower supporting details. */
export async function readFullSiteReportStream(
  response: Response,
  onOverview: (overview: FullSiteReportOverview) => void,
  onSupporting?: (supporting: FullSiteReportSupporting) => void,
): Promise<FullSiteReportResponse> {
  if (!response.body) throw new Error("Report response was empty. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let report: FullSiteReportResponse | undefined;
  let overview: FullSiteReportOverview | undefined;
  const accept = (line: string) => {
    if (!line.trim()) return;
    const frame = JSON.parse(line) as FullSiteReportFrame;
    if (frame.type === "error") throw new Error(frame.message);
    if (frame.type === "overview") { overview = frame.data; onOverview(overview); }
    else if (frame.type === "supporting") onSupporting?.(frame.data);
    else if (frame.type === "report") {
      if (!overview) throw new Error("Report assessment was missing. Please retry.");
      report = { ...frame.data, ...overview };
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        accept(pending.slice(0, newline)); pending = pending.slice(newline + 1);
      }
      if (done) break;
    }
    if (pending) accept(pending);
    if (!report) throw new Error("Supporting details did not finish loading. Please retry.");
    return report;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
