import { readFullSiteOptions } from "../../../../../server/scans/full-site-options";
import { loadFullSiteExport } from "../../../../../server/scans/full-site-report";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getVisualEvidenceArtifacts } from "../../../../../lib/scans/visual-evidence";
import { buildCanonicalReportExport } from "../../../../../server/scans/report-export";
import { renderCanonicalReportPdf } from "../../../../../server/scans/report-export-pdf";
import { loadPersistedScanReportProjection } from "../../../../../server/scans/scan-report-projection";
import { getPublicScanStatusProjection } from "../../../../../server/scans/scan-status-projection";
import { loadVisualEvidenceObject } from "../../../../../server/scans/visual-evidence-object";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function loadReportBrandLogo() {
  const candidates = [
    path.join(process.cwd(), "public", "certscore-mark-light.png"),
    path.join(process.cwd(), "apps", "web", "public", "certscore-mark-light.png"),
  ];
  for (const candidate of candidates) {
    try {
      return { body: await readFile(candidate), contentType: "image/png" };
    } catch {
      // Support both app-root and monorepo-root server working directories.
    }
  }
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { scanId } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(scanId)) return error(400, "Invalid scan ID.");
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "pdf") return error(400, "Format must be json or pdf.");

  const status = await getPublicScanStatusProjection(scanId);
  if (!status?.reportReady) return error(404, "The completed report is not available.");
  const scanRecord = await loadPersistedScanReportProjection({
    generation: status.reportGeneration,
    scanId,
  });
  if (!scanRecord) return error(404, "The persisted report projection is not available.");
  const fullSite = scanRecord.scan.scanConfigJson?.fullSite === true && (await readFullSiteOptions()).allowed ? await loadFullSiteExport(scanId) : undefined;
  if (request.nextUrl.searchParams.get("scope") === "full-site" && !fullSite) {
    return error(409, "The full-site report is not available for download.");
  }
  const report = buildCanonicalReportExport(scanRecord, fullSite);
  if (!report) return error(409, "The canonical report projection is unavailable for this scan.");

  const safeHost = (report.scan.domainHostname ?? "scan-report").replace(/[^a-z0-9.-]+/gi, "-").slice(0, 80);
  if (format === "pdf") {
    const brandLogo = await loadReportBrandLogo();
    const visualArtifact = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts)
      .sort((left, right) => Number(left.captureStep !== "initial_load") - Number(right.captureStep !== "initial_load"))
      .find((artifact) => artifact.status === "available" && artifact.key) ?? null;
    const visualEvidence = visualArtifact?.key
      ? await loadVisualEvidenceObject({
          bucket: visualArtifact.bucket,
          contentType: visualArtifact.mimeType,
          key: visualArtifact.key,
        })
      : null;
    return new NextResponse(renderCanonicalReportPdf(report, { brandLogo, visualEvidence }), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="certscore-${safeHost}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new NextResponse(`${JSON.stringify(report, null, 2)}\n`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="certscore-${safeHost}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
