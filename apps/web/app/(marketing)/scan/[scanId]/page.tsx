import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ShadowScanReport } from "../../../../components/scans/report-lab/shadow-scan-report";
import {
  SHADOW_REPORT,
  SHADOW_REPORT_SCAN_ID,
} from "../../../../components/scans/report-lab/shadow-report-data";
import { buildTimelineReportModel } from "../../../../components/scans/report-lab/timeline-report-model";
import { absoluteUrl } from "../../../../lib/seo";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import {
  getPublicScanStatusProjection,
  isCompletedScanStatus,
  isPendingScanStatus,
} from "../../../../server/scans/scan-status-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicScanDetailPageProps = {
  params: Promise<{ scanId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function legacyReportHref(scanId: string, searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const suffix = query.toString();
  return `/scano/${encodeURIComponent(scanId)}${suffix ? `?${suffix}` : ""}`;
}

function pendingReport(
  statusProjection: NonNullable<Awaited<ReturnType<typeof getPublicScanStatusProjection>>>,
  waitingForProjection: boolean,
) {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader mobilePrimaryAction="sign-in" />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PendingScanDetailView
          createdAt={statusProjection.createdAt}
          domainHostname={statusProjection.domainHostname}
          pageUrl={statusProjection.pageUrl}
          pendingPostCompletionWork={waitingForProjection}
          profile={statusProjection.profile}
          scanId={statusProjection.id}
          startedAt={statusProjection.startedAt}
          status={waitingForProjection ? "processing" : statusProjection.status}
        />
      </section>
      <SiteFooter />
    </main>
  );
}

export async function generateMetadata({ params }: PublicScanDetailPageProps): Promise<Metadata> {
  const { scanId } = await params;
  const localFixture = process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID;
  const statusProjection = localFixture ? null : await getPublicScanStatusProjection(scanId);
  const domain = statusProjection?.domainHostname ?? (localFixture ? SHADOW_REPORT.scan.host : null);
  if (!domain) {
    return { title: "Scan not found | CertScore.ai", robots: { follow: false, index: false } };
  }
  const title = `${domain} tracking, cookie, consent, and accessibility scan | CertScore.ai`;
  const description = `Automated CertScore.ai scan summary for ${domain}, including retained tracking, cookie, consent, privacy, and accessibility evidence.`;
  const reportUrl = absoluteUrl(`/scan/${scanId}`);
  return {
    alternates: { canonical: reportUrl },
    description,
    openGraph: { description, title, type: "website", url: reportUrl },
    robots: { follow: false, index: false },
    title: { absolute: title },
    twitter: { card: "summary_large_image", description, title },
  };
}

export default async function PublicScanDetailPage({ params, searchParams }: PublicScanDetailPageProps) {
  const [{ scanId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);

  // The retained fixture keeps the approved report reviewable on localhost,
  // where this production scan is not present in the local database.
  if (process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID) {
    return <ShadowScanReport report={SHADOW_REPORT} variant="timeline" />;
  }

  const statusProjection = await getPublicScanStatusProjection(scanId);
  if (!statusProjection) notFound();

  const waitingForReportProjection =
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !statusProjection.reportReady;
  if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection) {
    return pendingReport(statusProjection, waitingForReportProjection);
  }

  // Terminal failed/no-go records retain the established legacy handling.
  if (!isCompletedScanStatus(statusProjection.status)) {
    redirect(legacyReportHref(scanId, resolvedSearchParams));
  }

  const persistedReportProjection = statusProjection.reportReady
    ? await loadPersistedScanReportProjection({
        generation: statusProjection.reportGeneration,
        scanId,
      })
    : null;
  if (!persistedReportProjection) {
    return pendingReport(statusProjection, true);
  }

  const report = buildTimelineReportModel(persistedReportProjection);
  return <ShadowScanReport report={report} variant="timeline" />;
}
