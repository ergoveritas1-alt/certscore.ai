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
  const hasUnsafeDegradedExecution = Boolean(scan?.executionSummary?.degradedStages?.length);
  const shouldAttemptDetailedPreviewReport = Boolean(
    scan?.status === "completed" &&
      hasRenderablePreviewResult &&
      !hasUnsafeDegradedExecution
  );
  const previewSupplementalEvidence =
    scan?.previewPayload?.supplementalEvidence ?? scan?.previewPayload?.fallbackEvidence ?? null;

  if (scan && shouldAttemptDetailedPreviewReport) {
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
  const lightweightPreviewNotice =
    scan?.previewPayload && ((scan?.pagesScanned ?? 0) === 0 || Boolean(previewSupplementalEvidence))
      ? (
          <Card className="border-slate-200 bg-slate-50/70">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Supplemental evidence</Badge>
              </div>
              <CardTitle className="text-base">Lightweight results were enriched with supplemental public evidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              {previewSupplementalEvidence ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  {[
                    previewSupplementalEvidence.requestFootprint,
                    previewSupplementalEvidence.vendorFootprint,
                    previewSupplementalEvidence.disclosureFootprint
                  ]
                    .filter((section): section is NonNullable<typeof previewSupplementalEvidence.requestFootprint> => Boolean(section))
                    .map((section) => (
                      <div key={section.title} className="rounded-xl border border-sky-100 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                        <p className="mt-2 text-sm text-slate-800">{section.summary}</p>
                        {section.details.length > 0 ? (
                          <ul className="mt-3 space-y-1 text-xs text-slate-600">
                            {section.details.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
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
              previewNotice={lightweightPreviewNotice}
              previewPayload={scan.previewPayload}
              previewMode="homepage"
              scanRecord={fullScanRecord}
            />
          ) : scan.status === "completed" && hasRenderablePreviewResult && !shouldAttemptDetailedPreviewReport ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader>
                <CardTitle>
                  {hasUnsafeDegradedExecution
                    ? "Preview results were retained, but detailed report assembly was degraded"
                    : "Preview results were retained from a lightweight verification pass"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-700">
                <p>
                  {hasUnsafeDegradedExecution
                    ? "This preview completed, but one or more persistence steps degraded before the full detailed report could be assembled reliably."
                    : "This preview completed through a lightweight path that retained a safe preview summary without a fully assembled scan-detail record."}{" "}
                  To avoid showing a misleading executive summary, this page is falling back to the retained preview payload only.
                </p>
                {scan.previewPayload ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Retained preview summary</p>
                      <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                        <span>Overall score: {scan.previewPayload.scores?.overall ?? "unavailable"}</span>
                        <span>Privacy: {scan.previewPayload.scores?.privacy ?? "unavailable"}</span>
                        <span>Accessibility: {scan.previewPayload.scores?.accessibility ?? "unavailable"}</span>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {(scan.previewPayload.summaryBullets ?? []).map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                    {previewSupplementalEvidence ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supplemental evidence</p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          {[
                            previewSupplementalEvidence.requestFootprint,
                            previewSupplementalEvidence.vendorFootprint,
                            previewSupplementalEvidence.disclosureFootprint
                          ]
                            .filter((section): section is NonNullable<typeof previewSupplementalEvidence.requestFootprint> => Boolean(section))
                            .map((section) => (
                              <div key={section.title} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                                <p className="mt-2 text-sm text-slate-800">{section.summary}</p>
                                {section.details.length > 0 ? (
                                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                                    {section.details.map((detail) => (
                                      <li key={detail}>{detail}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Headline findings</p>
                      {(scan.previewPayload.sampleFindings ?? []).map((finding) => (
                        <div key={`${finding.category}-${finding.title}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{finding.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                            {finding.severity} · {finding.category} · {finding.affectedPage}
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{finding.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
