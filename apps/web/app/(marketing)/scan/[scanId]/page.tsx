import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import {
  SharedScanDetailView,
  buildScanReportUnifiedFindings,
  deriveVisualAccessLimitationNotice
} from "../../../../components/scans/shared-scan-detail-view";
import { AgentSummaryActions, ShareReportActions } from "../../../../components/scans/share-report-actions";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "../../../../components/scans/scan-submit-progress";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork
} from "../../../../lib/scans/scan-auto-refresh";
import { getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { absoluteUrl } from "../../../../lib/seo";
import { getPublicScanById } from "../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  materializeLocalV2DagScanDetail
} from "../../../../server/scans/local-v2-dag-report";
import {
  hasReadyScanReportProjection,
  persistScanReportProjection
} from "../../../../server/scans/scan-report-projection";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import {
  getPublicScanStatusProjection,
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
  }>;
};

function getPublicScanDomainLabel(domainHostname: string | null) {
  return domainHostname?.trim() || "Public website";
}

export async function generateMetadata({ params }: PublicScanDetailPageProps): Promise<Metadata> {
  const { scanId } = await params;
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
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const recentScanReused = resolvedSearchParams.recentScanReused === "1";
  const statusProjection = await getPublicScanStatusProjection(scanId);
  if (!statusProjection) {
    notFound();
  }
  if (isPendingScanStatus(statusProjection.status)) {
    return (
      <main className="min-h-screen bg-white">
        <SiteHeader />
        <section className="mx-auto max-w-6xl px-6 py-16">
          <PendingScanDetailView
            createdAt={statusProjection.createdAt}
            domainHostname={statusProjection.domainHostname}
            profile={statusProjection.profile}
            scanId={statusProjection.id}
            startedAt={statusProjection.startedAt}
            status={statusProjection.status}
          />
        </section>
        <SiteFooter />
      </main>
    );
  }
  const scanRecord = await getPublicScanById(scanId);

  if (!scanRecord) {
    notFound();
  }

  const localV2DagReportInput = getLocalV2DagReportInput(scanRecord);
  const persistedReportProjectionReady = hasReadyScanReportProjection(scanRecord);
  const displayScanRecord =
    localV2DagReportInput && scanRecord.scan.status === "completed" && !persistedReportProjectionReady
      ? await materializeLocalV2DagScanDetail(scanRecord)
      : scanRecord;
  if (!persistedReportProjectionReady && displayScanRecord.scan.status === "completed") {
    after(async () => {
      await persistScanReportProjection(displayScanRecord, {
        snapshot: scanRecord.snapshot,
        runtimeArtifacts: scanRecord.runtimeArtifacts
      }).catch((error) => {
        console.error("Failed to refresh completed scan report projection", error);
      });
    });
  }
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
              silent={Boolean(localV2DagReportInput)}
              status={displayScanRecord.scan.status}
            />
          }
          createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
          headerActions={
            displayScanRecord.scan.status === "completed" ? (
              <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <ShareReportActions
                  domainLabel={publicScanDomainLabel}
                  scanId={displayScanRecord.scan.id}
                  visualEvidenceHref={visualEvidenceHref}
                />
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
          localV2DagInFlightProgress={
            localV2DagReportInput && (scanRecord.scan.status === "queued" || scanRecord.scan.status === "running" || scanRecord.scan.status === "processing") ? (
              <LocalV2DagScanProgressCard
                createdAt={scanRecord.scan.createdAt}
                profileValue={localV2DagReportInput.profile}
                startedAt={scanRecord.scan.startedAt}
              />
            ) : null
          }
          scanRecord={displayScanRecord}
          showBrowserExtensionRecovery
          viewerAccessRole="user"
        />
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
