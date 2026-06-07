import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { AgentSummaryActions, ShareReportActions } from "../../../../components/scans/share-report-actions";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork
} from "../../../../lib/scans/scan-auto-refresh";
import { absoluteUrl } from "../../../../lib/seo";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";

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
  const scanRecord = await getAnonymousScanById(scanId);

  if (!scanRecord) {
    return {
      title: "Scan not found | CertScore.ai",
      robots: {
        follow: false,
        index: false
      }
    };
  }

  const domain = getPublicScanDomainLabel(scanRecord.scan.domainHostname);
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
  "CertScore.ai found a completed scan for this website from the past 24 hours, so this request opened the existing report instead of starting a duplicate scan.";

export default async function PublicScanDetailPage({ params, searchParams }: PublicScanDetailPageProps) {
  const { scanId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const recentScanReused = resolvedSearchParams.recentScanReused === "1";
  const scanRecord = await getAnonymousScanById(scanId);

  if (!scanRecord) {
    notFound();
  }

  const pendingBrowserExtensionNormalization = hasPendingBrowserExtensionNormalization({
    events: scanRecord.events,
    scanType: scanRecord.scan.scanType,
    status: scanRecord.scan.status
  });
  const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
  await persistReportFindingCount({
    count: reportFindingCount,
    scanId: scanRecord.scan.id
  });
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });
  const publicScanDomainLabel = getPublicScanDomainLabel(scanRecord.scan.domainHostname);

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SharedScanDetailView
          analyticsScanSource="homepage"
          autoRefresh={
            <ScanStatusAutoRefresh
              pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
              pendingPostCompletionWork={pendingPostCompletionWork}
              status={scanRecord.scan.status}
            />
          }
          createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
          headerActions={
            scanRecord.scan.status === "completed" ? (
              <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <ShareReportActions
                  domainLabel={publicScanDomainLabel}
                  scanId={scanRecord.scan.id}
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
          scanRecord={scanRecord}
          viewerAccessRole="user"
        />
        {scanRecord.scan.status === "completed" ? (
          <div className="mt-8 space-y-4">
            <AgentSummaryActions domainLabel={publicScanDomainLabel} scanId={scanRecord.scan.id} />
          </div>
        ) : null}
      </section>
      <SiteFooter />
    </main>
  );
}
