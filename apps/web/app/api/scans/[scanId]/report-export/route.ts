import { readFullSiteOptions } from "../../../../../server/scans/full-site-options";
import { loadFullSiteExport } from "../../../../../server/scans/full-site-report";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getVisualEvidenceArtifacts } from "../../../../../lib/scans/visual-evidence";
import { buildCanonicalReportExport } from "../../../../../server/scans/report-export";
import { buildTrackingWorkpaper, renderTrackingWorkpaperCsv } from "../../../../../server/scans/tracking-workpaper";
import { renderCanonicalReportPdf } from "../../../../../server/scans/report-export-pdf";
import { UnsafeReportPdfContentError } from "../../../../../server/scans/report-pdf-public-safety";
import { pdfTimeZone } from "../../../../../server/scans/report-pdf-time";
import { loadPersistedScanReportProjection } from "../../../../../server/scans/scan-report-projection";
import { getPublicScanStatusProjection } from "../../../../../server/scans/scan-status-projection";
import { loadVisualEvidenceObject } from "../../../../../server/scans/visual-evidence-object";
import { getCurrentUser, getDashboardContext } from "../../../../../server/auth";
import { isPlatformAdminEmail } from "../../../../../server/admin/platform-admin";
import { normalizeReportHeaderTheme, type ReportHeaderTheme } from "../../../../../lib/report-header-theme";
import { getWorkspaceBrandingRecord, loadWorkspaceReportLogo } from "../../../../../server/company/report-branding";
import { getOrganizationScanStatusProjection } from "../../../../../server/scans/scan-status-projection";
import { canManageCompanyLogo } from "../../../../../server/company/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function loadReportBrandLogo(headerTheme: ReportHeaderTheme) {
  const filename = headerTheme === "black" ? "certscore-mark-light.png" : "certscore-mark-dark.png";
  const candidates = [
    path.join(process.cwd(), "public", filename),
    path.join(process.cwd(), "apps", "web", "public", filename),
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
  if (format !== "json" && format !== "pdf" && format !== "csv") return error(400, "Format must be json, pdf or csv.");
  const timeZone = pdfTimeZone(request.nextUrl.searchParams.get("timeZone"));
  if (format === "pdf" && !timeZone) return error(400, "Invalid report time zone.");
  const branding = request.nextUrl.searchParams.get("branding");
  if (branding !== null && branding !== "workspace") return error(400, "Invalid report branding.");
  if (branding && format !== "pdf") return error(400, "Workspace branding is available for PDF exports.");
  let workspaceId: string | null = null;
  if (format === "pdf") {
    if (!await getCurrentUser()) return error(401, "Sign in to download a PDF report.");
    const viewer = await getDashboardContext();
    if (!canManageCompanyLogo({ isPlatformAdmin: isPlatformAdminEmail(viewer.user.email), membershipRole: viewer.membership.role })) {
      return error(403, "Advanced access is required for PDF reports.");
    }
    const accessible = isPlatformAdminEmail(viewer.user.email) || await getOrganizationScanStatusProjection({ organizationId: viewer.organization.id, scanId });
    if (!accessible) return error(404, "Report not available in this workspace.");
    workspaceId = viewer.organization.id;
  }
  const focus = request.nextUrl.searchParams.get("reviewFocus");
  if (focus !== null && focus !== "gdpr_eprivacy" && focus !== "ccpa_cpra") return error(400, "Invalid review focus.");
  const trackingWorkpaper = format === "csv" || (format === "json" && request.nextUrl.searchParams.get("workpaper") === "tracking");
  if (trackingWorkpaper && request.nextUrl.searchParams.get("scope") === "full-site") return error(400, "Tracking workpapers cover the starting page; use the full-site JSON export for additional pages.");

  const status = await getPublicScanStatusProjection(scanId);
  if (!status?.reportReady) return error(404, "The completed report is not available.");
  const scanRecord = await loadPersistedScanReportProjection({
    generation: status.reportGeneration,
    scanId,
  });
  if (!scanRecord) return error(404, "The persisted report projection is not available.");
  const fullSite = !trackingWorkpaper && scanRecord.scan.scanConfigJson?.fullSite === true && (await readFullSiteOptions()).allowed ? await loadFullSiteExport(scanId) : undefined;
  if (request.nextUrl.searchParams.get("scope") === "full-site" && !fullSite) {
    return error(409, "The full-site report is not available for download.");
  }
  const report = buildCanonicalReportExport(scanRecord, fullSite, focus ?? (format === "pdf" ? "gdpr_eprivacy" : undefined));
  if (!report) return error(409, "The canonical report projection is unavailable for this scan.");

  const safeHost = (report.scan.domainHostname ?? "scan-report").replace(/[^a-z0-9.-]+/gi, "-").slice(0, 80);
  if (format === "csv") return new NextResponse(renderTrackingWorkpaperCsv(report), {
    headers: {
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="certscore-${safeHost}-tracking.csv"`,
    },
  });
  if (format === "pdf") {
    const headerTheme = normalizeReportHeaderTheme(workspaceId ? (await getWorkspaceBrandingRecord(workspaceId))?.headerTheme : undefined);
    let workspaceBrand;
    if (branding === "workspace" && workspaceId) {
      try {
        workspaceBrand = await loadWorkspaceReportLogo(workspaceId);
      } catch {
        return error(409, "The workspace logo could not be loaded. Upload a new logo in Settings and try again.");
      }
      if (!workspaceBrand) return error(409, "Upload a workspace logo in Settings before downloading a white-label PDF.");
    }
    const brandLogo = workspaceBrand?.image ?? await loadReportBrandLogo(headerTheme);
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
    let pdf: ReturnType<typeof renderCanonicalReportPdf>;
    try {
      pdf = renderCanonicalReportPdf(report, { appUrl: process.env.NEXT_PUBLIC_APP_URL, brandLogo, brandName: workspaceBrand?.name, headerTheme, visualEvidence, timeZone: timeZone ?? "UTC" });
    } catch (failure) {
      if (failure instanceof UnsafeReportPdfContentError) return error(422, "This report contains internal infrastructure details and cannot be exported as a PDF.");
      throw failure;
    }
    return new NextResponse(pdf, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${workspaceBrand ? "report" : "certscore"}-${safeHost}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new NextResponse(`${JSON.stringify(request.nextUrl.searchParams.get("workpaper") === "tracking" ? buildTrackingWorkpaper(report) : report, null, 2)}\n`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="certscore-${safeHost}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
