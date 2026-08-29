import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

// Preserved locally as the pre-refresh report for side-by-side comparison.
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import {
  SharedScanDetailView,
  buildScanReportUnifiedFindings,
  deriveVisualAccessLimitationNotice
} from "../../../../components/scans/shared-scan-detail-view";
import { AgentSummaryActions, ShareReportActions } from "../../../../components/scans/share-report-actions";
import { ReportDownloadActions } from "../../../../components/scans/report-download-actions";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork
} from "../../../../lib/scans/scan-auto-refresh";
import { getHomepageScreenshotState, getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { absoluteUrl } from "../../../../lib/seo";
import {
  SHADOW_REPORT,
  SHADOW_REPORT_SCAN_ID,
  SHADOW_REPORT_SOURCE_URL
} from "../../../../components/scans/report-lab/shadow-report-data";
import { getPublicScanById } from "../../../../server/scans/get-scan-by-id";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import {
  getPublicScanStatusProjection,
  isCompletedScanStatus,
  isPendingScanStatus
} from "../../../../server/scans/scan-status-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
  searchParams?: Promise<{
    recentScanReused?: string;
    source?: string;
  }>;
};

function getPublicScanDomainLabel(domainHostname: string | null) {
  return domainHostname?.trim() || "Public website";
}

export async function generateMetadata({ params }: PublicScanDetailPageProps): Promise<Metadata> {
  const { scanId } = await params;
  if (process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID) {
    return {
      title: { absolute: `Previous report for ${SHADOW_REPORT.scan.host} | CertScore.ai` },
      robots: { follow: false, index: false }
    };
  }
  const scanRecord = await getPublicScanStatusProjection(scanId);

  if (!scanRecord) {
    return {
      title: "Scan not found | CertScore.ai",
      robots: {
        follow: false,
        index: false
      }
    };
  }

  const domain = getPublicScanDomainLabel(scanRecord.domainHostname);
  const title = `${domain} tracking, cookie, consent, and accessibility scan | CertScore.ai`;
  const description = `Automated CertScore.ai scan summary for ${domain}, including observed tracking, cookie, consent, and accessibility risk signals. Review the evidence; automated findings may contain errors.`;
  const reportUrl = absoluteUrl(`/scan/${scanId}`);

  return {
    title: {
      absolute: title
    },
    description,
    alternates: {
      canonical: reportUrl
    },
    // Public report pages remain noindex until there is an intentional allowlist
    // strategy for indexable scans, owner controls, retention rules, and safe
    // redaction of any sensitive context in generated metadata.
    robots: {
      follow: false,
      index: false
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: reportUrl
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

const RECENT_SCAN_REUSED_MESSAGE =
  "Recently scanned. Select Fresh re-scan to run a new scan.";

export default async function PublicScanDetailPage({ params, searchParams }: PublicScanDetailPageProps) {
  const { scanId } = await params;
  if (process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID) {
    redirect(SHADOW_REPORT_SOURCE_URL);
  }
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const recentScanReused = resolvedSearchParams.recentScanReused === "1";
  const fromLightMcpDemo = resolvedSearchParams.source === "mcp-light-demo";
  const statusProjection = await getPublicScanStatusProjection(scanId);
  if (!statusProjection) {
    notFound();
  }
  const waitingForReportProjection =
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !statusProjection.reportReady;
  if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection) {
    return (
      <main className="min-h-screen bg-white">
        <SiteHeader />
        <section className="mx-auto max-w-6xl px-6 py-16">
          <PendingScanDetailView
            createdAt={statusProjection.createdAt}
            domainHostname={statusProjection.domainHostname}
            initialPreConsentPreview={statusProjection.preConsentPreview ?? null}
            pageUrl={statusProjection.pageUrl}
            pendingPostCompletionWork={waitingForReportProjection}
            profile={statusProjection.profile}
            scanId={statusProjection.id}
            startedAt={statusProjection.startedAt}
            status={waitingForReportProjection ? "processing" : statusProjection.status}
          />
        </section>
        <SiteFooter />
      </main>
    );
  }
  const localPersistedReportProjection = statusProjection.reportReady
    ? await loadPersistedScanReportProjection({
        generation: statusProjection.reportGeneration,
        scanId,
      })
    : null;
  if (
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !localPersistedReportProjection
  ) {
    return (
      <main className="min-h-screen bg-white">
        <SiteHeader />
        <section className="mx-auto max-w-6xl px-6 py-16">
          <PendingScanDetailView
            createdAt={statusProjection.createdAt}
            domainHostname={statusProjection.domainHostname}
            initialPreConsentPreview={statusProjection.preConsentPreview ?? null}
            pageUrl={statusProjection.pageUrl}
            pendingPostCompletionWork
            profile={statusProjection.profile}
            scanId={statusProjection.id}
            startedAt={statusProjection.startedAt}
            status="processing"
          />
        </section>
        <SiteFooter />
      </main>
    );
  }
  const scanRecord = localPersistedReportProjection ?? await getPublicScanById(scanId);

  if (!scanRecord) {
    notFound();
  }

  const displayScanRecord = scanRecord;
  const pendingBrowserExtensionNormalization = hasPendingBrowserExtensionNormalization({
    events: scanRecord.events,
    scanType: scanRecord.scan.scanType,
    status: scanRecord.scan.status
  });
  const reportFindingCount = buildScanReportUnifiedFindings(displayScanRecord).length;
  await persistReportFindingCount({
    count: reportFindingCount,
    scanId: displayScanRecord.scan.id
  });
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });
  const publicScanDomainLabel = getPublicScanDomainLabel(displayScanRecord.scan.domainHostname);
  const visualEvidenceArtifacts = getVisualEvidenceArtifacts(displayScanRecord.runtimeArtifacts).sort((left, right) => {
    const leftPriority = left.captureStep === "initial_load" ? 0 : 1;
    const rightPriority = right.captureStep === "initial_load" ? 0 : 1;
    return leftPriority - rightPriority;
  });
  const visualEvidenceArtifact =
    visualEvidenceArtifacts.find((artifact) => artifact.status === "available" && artifact.key) ?? null;
  const visualEvidenceHref = visualEvidenceArtifact
    ? `/api/scans/${displayScanRecord.scan.id}/visual-evidence/${encodeURIComponent(visualEvidenceArtifact.id)}`
    : null;
  const homepageScreenshotState = getHomepageScreenshotState(displayScanRecord.runtimeArtifacts);
  const isNoGoReport = Boolean(deriveVisualAccessLimitationNotice(displayScanRecord.runtimeArtifacts));

  return (
    <main className="min-h-screen bg-white">
      <ScanProgressReportVisible scanId={displayScanRecord.scan.id} />
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SharedScanDetailView
          analyticsScanSource="homepage"
          autoRefresh={
            <ScanStatusAutoRefresh
              pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
              pendingPostCompletionWork={pendingPostCompletionWork}
              scanId={displayScanRecord.scan.id}
              silent={statusProjection.reportProjectionRequired}
              status={displayScanRecord.scan.status}
            />
          }
          createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
          headerActions={
            displayScanRecord.scan.status === "completed" ? (
              <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareReportActions
                    domainLabel={publicScanDomainLabel}
                    scanId={displayScanRecord.scan.id}
                    visualEvidenceHref={visualEvidenceHref}
                    visualEvidenceWithheldReason={homepageScreenshotState?.status === "withheld" ? homepageScreenshotState.reason : null}
                  />
                  <ReportDownloadActions scanId={displayScanRecord.scan.id} />
                </div>
                <div className="w-full lg:ml-auto lg:max-w-[calc(16rem+20ch)]">
                  <DomainScanForm
                    buttonLabel="Scan"
                    compact
                    inputLabel="Scan another website"
                    inputPlaceholder="Enter another site"
                    mode="full"
                    scanSource="homepage"
                  />
                </div>
              </div>
            ) : null
          }
          headerActionsPlacement="belowTitle"
          localV2DagInFlightProgress={null}
          reportGeneration={statusProjection.reportGeneration}
          scanRecord={displayScanRecord}
          showBrowserExtensionRecovery
          viewerAccessRole="user"
        />
        {fromLightMcpDemo ? (
          <aside className="mt-8 flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="Authenticated MCP upgrade">
            <div>
              <p className="font-semibold text-slate-950">Need more scans or advanced tools? Upgrade to Authenticated MCP.</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Keep the same core scan identifiers and canonical response fields while adding higher-volume access, history, and approved advanced tools.</p>
            </div>
            <Link className="inline-flex shrink-0 justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" href="/developers/mcp#authenticated-mcp">Compare authenticated options</Link>
          </aside>
        ) : null}
        {displayScanRecord.scan.status === "completed" && !isNoGoReport ? (
          <div className="mt-8 space-y-4">
            <AgentSummaryActions domainLabel={publicScanDomainLabel} scanId={displayScanRecord.scan.id} />
          </div>
        ) : null}
      </section>
      <SiteFooter />
    </main>
  );
}
