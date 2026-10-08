import { loadAuthorizedReportEvidence, ReportEvidenceAccessError } from "../../../../../../../lib/api-v2/report-evidence-access";
import { parseBearerToken, validateCertScoreBearerToken } from "../../../../../../../server/integrations/api-keys";
import { enforceApiV2ScanReadThrottle } from "../../../../../../../server/pulse/api-v2-read-throttle";
import { loadAnonymousPersistedScanReportProjection, loadPersistedScanReportProjection } from "../../../../../../../server/scans/scan-report-projection";
import { loadFullSiteFormSnapshot } from "../../../../../../../server/scans/full-site-forms";
import { loadSinglePageFormSnapshot } from "../../../../../../../server/scans/local-v2-dag-report";
import { CANONICAL_SCAN_ID_PATTERN } from "@certscore/api-contracts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  const params = new URL(request.url).searchParams;
  const pageId = params.get("formPage");
  const formRef = params.get("formRef") ?? "";
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const unavailable = (status = 404) => new Response(null, { status, headers });
  if (!CANONICAL_SCAN_ID_PATTERN.test(scanId) || params.getAll("formRef").length !== 1 ||
    !/^(?:after_accept:)?collection_form_\d+$/.test(formRef) ||
    (pageId !== null && (params.getAll("formPage").length !== 1 || !CANONICAL_SCAN_ID_PATTERN.test(pageId) ||
      formRef.startsWith("after_accept:")))) return unavailable(400);
  try {
    const limited = await enforceApiV2ScanReadThrottle({ request, requestId: crypto.randomUUID(), scanId, route: "api-v2-report-form-snapshot", detail: "evidence" });
    if (limited) return limited;
    const record = await loadAuthorizedReportEvidence({ scanId, bearer: parseBearerToken(request), validate: validateCertScoreBearerToken,
      loadOwned: loadPersistedScanReportProjection, loadPublic: loadAnonymousPersistedScanReportProjection });
    if (!record || record.scan.status !== "completed" || (pageId !== null && record.scan.scanConfigJson?.fullSite !== true)) return unavailable();
    // Existing verifier binds the page, attempt, configuration, inventory and image checksum.
    const bytes = pageId !== null ? await loadFullSiteFormSnapshot(scanId, pageId, formRef)
      : await loadSinglePageFormSnapshot(record, formRef);
    return bytes ? new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": 'attachment; filename="form.jpg"' } }) : unavailable();
  } catch (error) {
    if (error instanceof ReportEvidenceAccessError) return unavailable(403);
    return unavailable();
  }
}
