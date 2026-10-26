import { NextResponse } from "next/server";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";
import { isSampleScanFrom, parseHomepageLocation, resolveSampleScanFrom, type SampleScanFrom } from "../../lib/marketing/homepage-location";
import { anonymousVisitorScanFrom } from "../../lib/scans/visitor-scan-default";
import type { SampleReportResolution } from "./sample-report-resolution";

type Dependencies = {
  getCurrentUser: () => Promise<unknown>;
  resolve: (scanFrom: SampleScanFrom) => Promise<SampleReportResolution>;
  classifyQuotaError: (error: unknown) => { retryAfterSeconds: number } | null;
};

function json(body: unknown, status = 200, retryAfterSeconds?: number) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
  } });
}

export async function handleSampleReportRequest(request: Request, dependencies: Dependencies) {
  if (request.method !== "POST") return json({ error: "Use the sample report button to open a report." }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open the sample report from CertScore.ai." }, 403);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: "Invalid sample report request." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "Invalid sample report request." }, 400);
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== "scanFrom" && key !== "loc")
    || (body.scanFrom != null && !isSampleScanFrom(body.scanFrom))
    || (body.loc != null && !parseHomepageLocation(body.loc))) {
    return json({ error: "Choose a supported sample scan location." }, 400);
  }
  try {
    const locationOverride = parseHomepageLocation(body.loc);
    // A loc preview changes the public homepage experience, never authentication.
    if (await dependencies.getCurrentUser() && !locationOverride) {
      return json({ resolution: "signed_in", scanUrl: AUTHENTIC_SAMPLE_REPORT_URL });
    }
    const scanFrom = resolveSampleScanFrom({
      manualScanFrom: body.scanFrom,
      locationOverride,
      countryDefault: anonymousVisitorScanFrom(request.headers, false) ?? "eu_ie",
    });
    const result = await dependencies.resolve(scanFrom);
    if ("retryAfterSeconds" in result) {
      return json({
        code: result.kind === "busy" ? "sample_report_busy" : "sample_report_refresh_unavailable",
        error: result.kind === "busy" ? "The sample report is being prepared. Please try again."
          : "The sample scan could not complete. Please try again later.",
      }, result.kind === "busy" ? 503 : 429, result.retryAfterSeconds);
    }
    return json({ scanFrom, resolution: result.kind, scanId: result.scanId, scanUrl: `/scan/${result.scanId}` }, result.kind === "recent" ? 200 : 202);
  } catch (error) {
    const quota = dependencies.classifyQuotaError(error);
    if (quota) return json({ error: "The anonymous scan limit was reached. Please try again later." }, 429, quota.retryAfterSeconds);
    console.error("[sample-report] open failed", { error: error instanceof Error ? error.name : "unknown" });
    return json({ error: "The sample report could not be opened. Please try again." }, 503);
  }
}
