import { requireReportViewer, reportReturnPath } from "../../../../server/scans/report-access";
import { readFullSiteOptions } from "../../../../server/scans/full-site-options";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache, type ReactNode } from "react";
import { AppHeader } from "../../../../components/dashboard/app-shell";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import { ShadowScanReport } from "../../../../components/scans/report-lab/shadow-scan-report";
import { ReportGuestShareProvider } from "../../../../components/scans/report-lab/shadow-report-actions";
import { isPublicAccountCreationEnabled } from "../../../../server/access-control";
import {
  SHADOW_REPORT,
  SHADOW_REPORT_SCAN_ID,
} from "../../../../components/scans/report-lab/shadow-report-data";
import { buildTerminalRuntimeVisitReport, buildVerifiedTimelineReportModel } from "../../../../server/scans/verified-timeline-report-model";
import { absoluteUrl } from "../../../../lib/seo";
import { getDashboardContext } from "../../../../server/auth";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { canManageCompanyLogo } from "../../../../server/company/policy";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import {
  getOrganizationScanStatusProjection,
  getPublicScanStatusProjection,
  isCompletedScanStatus,
  isPendingScanStatus,
} from "../../../../server/scans/scan-status-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const loadReadyReport = cache((scanId: string) =>
  loadPersistedScanReportProjection({ scanId })
);
const loadScanStatus = cache((scanId: string) => getPublicScanStatusProjection(scanId));
const loadReportViewer = cache(requireReportViewer);

type PublicScanDetailPageProps = {
  params: Promise<{ scanId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function SignedInReportHeader() {
  const { organization, user } = await getDashboardContext();
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  return <AppHeader
    isPlatformAdmin={isPlatformAdmin}
    canManageCompany={isPlatformAdmin}
    organizationName={organization?.name ?? "No workspace assigned"}
    plan={organization?.plan ?? "free"}
    userEmail={user.email ?? "Unknown user"}
  />;
}

async function renderSharedReport(
  report: Awaited<ReturnType<typeof buildVerifiedTimelineReportModel>>,
  scanId: string,
  reviewFocus: string | string[] | undefined,
  signedIn: boolean,
) {
  if (!signedIn) {
    return <ReportGuestShareProvider allowCreateAccount={isPublicAccountCreationEnabled()}>
      <ShadowScanReport reviewFocus={reviewFocus} report={{ ...report, fullSite: undefined }} variant="timeline" />
    </ReportGuestShareProvider>;
  }
  const viewer = await getDashboardContext();
  const isPlatformAdmin = isPlatformAdminEmail(viewer.user.email);
  // Match the PDF endpoint's role and workspace checks before offering the link.
  const organizationId = viewer.organization?.id;
  const canExportPdf = Boolean(organizationId &&
    canManageCompanyLogo({ isPlatformAdmin, membershipRole: viewer.membership?.role ?? null }) &&
    (isPlatformAdmin || await getOrganizationScanStatusProjection({ organizationId, scanId })));
  return <ShadowScanReport header={<SignedInReportHeader />} canExportPdf={canExportPdf} reviewFocus={reviewFocus} report={{ ...report, fullSite: undefined }} variant="timeline" />;
}

function legacyReportHref(scanId: string, searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const suffix = query.toString();
  return `/scano/${encodeURIComponent(scanId)}${suffix ? `?${suffix}` : ""}`;
}

function scanPage(signedIn: boolean, children: ReactNode) {
  return (
    <main className="min-h-screen bg-white">
      {signedIn ? <SignedInReportHeader /> : <SiteHeader mobilePrimaryAction="sign-in" />}
      <section className="mx-auto max-w-6xl px-6 py-16">
        {children}
      </section>
      <SiteFooter />
    </main>
  );
}

async function pendingReport(
  statusProjection: NonNullable<Awaited<ReturnType<typeof getPublicScanStatusProjection>>>,
  waitingForProjection: boolean,
  signedIn: boolean,
) {
  return scanPage(signedIn, <PendingScanDetailView
    fullSite={(await readFullSiteOptions()).allowed ? statusProjection.fullSite : undefined}
    createdAt={statusProjection.createdAt}
    domainHostname={statusProjection.domainHostname}
    initialPreConsentPreview={statusProjection.preConsentPreview ?? null}
    pageUrl={statusProjection.pageUrl}
    pendingPostCompletionWork={waitingForProjection}
    profile={statusProjection.profile}
    scanId={statusProjection.id}
    startedAt={statusProjection.startedAt}
    status={waitingForProjection ? "processing" : statusProjection.status}
  />);
}

export async function generateMetadata({ params, searchParams }: PublicScanDetailPageProps): Promise<Metadata> {
  const { scanId } = await params;
  const viewer = await loadReportViewer(scanId, reportReturnPath(`/scan/${encodeURIComponent(scanId)}`, await searchParams));
  const localFixture = process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID;
  const persistedReport = localFixture ? null : await loadReadyReport(scanId);
  const statusProjection = localFixture || persistedReport ? null : viewer.signedIn ? await loadScanStatus(scanId) : viewer.scan;
  const domain = persistedReport?.scan.domainHostname ?? statusProjection?.domainHostname ??
    (localFixture ? SHADOW_REPORT.scan.host : null);
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
    robots: { follow: true, index: false },
    title: { absolute: title },
    twitter: { card: "summary_large_image", description, title },
  };
}

export default async function PublicScanDetailPage({ params, searchParams }: PublicScanDetailPageProps) {
  const routeStartedAt = performance.now();
  const [{ scanId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  const viewer = await loadReportViewer(scanId, reportReturnPath(`/scan/${encodeURIComponent(scanId)}`, resolvedSearchParams));

  // The retained fixture keeps the approved report reviewable on localhost,
  // where this production scan is not present in the local database.
  if (process.env.NODE_ENV !== "production" && scanId === SHADOW_REPORT_SCAN_ID) {
    return <ShadowScanReport header={viewer.signedIn ? <SignedInReportHeader /> : undefined} reviewFocus={resolvedSearchParams.reviewFocus} report={SHADOW_REPORT} variant="timeline" />;
  }

  const projectionStartedAt = performance.now();
  const readyReport = await loadReadyReport(scanId);
  const projectionLoadMs = Math.round(performance.now() - projectionStartedAt);
  if (readyReport) {
    const modelStartedAt = performance.now();
    const report = await buildVerifiedTimelineReportModel(readyReport);
    console.info("[public-scan-report] ready projection rendered", {
      modelBuildMs: Math.round(performance.now() - modelStartedAt),
      projectionLoadMs,
      projectionPayloadBytes: readyReport.snapshot?.report_projection_payload_size_bytes ?? null,
      routeElapsedMs: Math.round(performance.now() - routeStartedAt),
      scanId,
      sourceHash: readyReport.snapshot?.report_projection_source_hash ?? null,
    });
    if (viewer.signedIn && report.fullSite && (await readFullSiteOptions()).allowed) redirect(`/app/scans/${scanId}${typeof resolvedSearchParams.reviewFocus === "string" ? `?reviewFocus=${encodeURIComponent(resolvedSearchParams.reviewFocus)}` : ""}`);
    return renderSharedReport(report, scanId, resolvedSearchParams.reviewFocus, viewer.signedIn);
  }

  const statusStartedAt = performance.now();
  const statusProjection = viewer.signedIn ? await loadScanStatus(scanId) : viewer.scan;
  const statusLoadMs = Math.round(performance.now() - statusStartedAt);
  if (!statusProjection) notFound();

  const completed = isCompletedScanStatus(statusProjection.status);
  const pending = isPendingScanStatus(statusProjection.status);
  const terminalReport = buildTerminalRuntimeVisitReport(statusProjection);
  if (terminalReport) {
    if (viewer.signedIn) return <ShadowScanReport header={<SignedInReportHeader />} report={terminalReport} variant="timeline" />;
    return renderSharedReport(terminalReport, scanId, resolvedSearchParams.reviewFocus, false);
  }

  if (statusProjection.publicationRequestStatus === "terminal_failure" || (!viewer.signedIn && !pending && !completed)) {
    return scanPage(viewer.signedIn, <>
      <ScanProgressReportVisible scanId={scanId} trackTiming={false} />
      <h1 className="text-2xl font-semibold text-slate-950">Scan ended without a report</h1>
      <Link href="/#homepage-scan" className="mt-4 inline-block text-sky-800 underline">Start another scan</Link>
    </>);
  }

  const waitingForReportProjection = completed && statusProjection.reportProjectionRequired && !statusProjection.reportReady;
  if (pending || waitingForReportProjection) {
    return pendingReport(statusProjection, waitingForReportProjection, viewer.signedIn);
  }

  // Terminal failed/no-go records retain the established legacy handling.
  if (!completed) {
    redirect(legacyReportHref(scanId, resolvedSearchParams));
  }

  const persistedReportProjection = statusProjection.reportReady
    ? await loadReadyReport(
        scanId,
      )
    : null;
  if (!persistedReportProjection) {
    return pendingReport(statusProjection, true, viewer.signedIn);
  }

  const report = await buildVerifiedTimelineReportModel(persistedReportProjection);
  console.info("[public-scan-report] fallback projection rendered", {
    projectionLoadMs,
    routeElapsedMs: Math.round(performance.now() - routeStartedAt),
    scanId,
    statusLoadMs,
  });
  if (viewer.signedIn && report.fullSite && (await readFullSiteOptions()).allowed) redirect(`/app/scans/${scanId}${typeof resolvedSearchParams.reviewFocus === "string" ? `?reviewFocus=${encodeURIComponent(resolvedSearchParams.reviewFocus)}` : ""}`);
  return renderSharedReport(report, scanId, resolvedSearchParams.reviewFocus, viewer.signedIn);
}
