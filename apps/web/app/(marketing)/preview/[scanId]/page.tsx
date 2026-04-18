import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { PreviewScanState } from "../../../../components/marketing/preview-scan-state";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import {
  buildPreviewExecutiveAccessLimitationNotice,
  deriveUnverifiedHomepageReview,
  SharedScanDetailView
} from "../../../../components/scans/shared-scan-detail-view";
import { getPreviewScan } from "../../../../server/preview-scan/get-preview-scan";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";

export const dynamic = "force-dynamic";

type PreviewScanPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function PreviewScanPage({ params }: PreviewScanPageProps) {
  const { scanId } = await params;
  const scan = await getPreviewScan(scanId);
  let fullScanRecord = null;
  let detailLoadError = false;
  const hasRenderablePreviewResult = Boolean(scan?.previewPayload);

  if (scan?.status === "completed" && hasRenderablePreviewResult) {
    try {
      fullScanRecord = await getAnonymousScanById(scan.scanId);
    } catch (error) {
      detailLoadError = true;
      console.warn("[preview-scan] failed to load anonymous scan detail", {
        error: error instanceof Error ? error.message : String(error),
        previewScanId: scan.scanId
      });
    }
  }
  const previewExecutiveAccessLimitationNotice =
    scan?.previewPayload?.resultState && fullScanRecord
      ? buildPreviewExecutiveAccessLimitationNotice({
          resultState: {
            code: scan.previewPayload.resultState.code,
            coverageLevel: scan.previewPayload.resultState.coverageLevel,
            message: scan.previewPayload.resultState.message,
            title: scan.previewPayload.resultState.title
          },
          review: fullScanRecord.snapshot
            ? deriveUnverifiedHomepageReview(fullScanRecord.snapshot, fullScanRecord.events, fullScanRecord.policyEnrichment)
            : null
        })
      : null;
  const loginHref = scan
    ? `/login?${new URLSearchParams({
        domain: scan.hostname,
        next: "/app",
        previewScanId: scan.scanId
      }).toString()}`
    : null;

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        {scan ? (
          scan.status === "queued" || scan.status === "running" || scan.status === "failed" ? (
            <PreviewScanState initialScan={scan} />
          ) : loginHref && fullScanRecord && hasRenderablePreviewResult ? (
            <SharedScanDetailView
              createAccountHref={loginHref}
              executiveAccessLimitationOverride={previewExecutiveAccessLimitationNotice}
              headerActions={
                <div className="w-full max-w-[21rem]">
                  <DomainScanForm
                    buttonLabel="Scan"
                    compact
                    inputLabel="Scan another website"
                    inputPlaceholder="Enter another site"
                    mode="preview"
                  />
                </div>
              }
              previewMode="homepage"
              scanRecord={fullScanRecord}
            />
          ) : scan.status === "completed" && !hasRenderablePreviewResult ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader>
                <CardTitle>Homepage preview data was not captured</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p>
                  This preview did not retain a homepage snapshot, so the report cannot responsibly summarize privacy, consent, or third-party behavior for this site.
                </p>
                <p>
                  The scan record shows no scanned pages and no preview payload. Treat this run as incomplete rather than as a clean result.
                </p>
              </CardContent>
            </Card>
          ) : detailLoadError ? (
            <Card className="border-slate-200 bg-white">
              <CardHeader>
                <CardTitle>Preview findings are still loading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>
                  The homepage preview scan completed, but the detailed findings view could not be assembled from the retained scan record yet.
                </p>
                <p>
                  Refresh this page in a moment or start a new preview scan. The raw preview scan record is still available.
                </p>
              </CardContent>
            </Card>
          ) : null
        ) : (
          <div className="space-y-6">
            <Badge tone="warning">Preview not found</Badge>
            <Card className="border-slate-200 bg-white">
              <CardHeader>
                <CardTitle>This preview scan is unavailable</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                The scan may have expired or the URL is invalid. Start a new homepage preview from
                the public landing page.
              </CardContent>
            </Card>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
