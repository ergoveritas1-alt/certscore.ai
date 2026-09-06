import { readFullSiteOptions } from "../../../../server/scans/full-site-options";
import { notFound, redirect } from "next/navigation";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ShadowScanReport } from "../../../../components/scans/report-lab/shadow-scan-report";
import { buildTimelineReportModel } from "../../../../components/scans/report-lab/timeline-report-model";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../server/auth";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import {
  getOrganizationScanStatusProjection,
  getPublicScanStatusProjection,
  isCompletedScanStatus,
  isPendingScanStatus,
} from "../../../../server/scans/scan-status-projection";
import { canUseRestrictedScanOptions } from "../../../../server/scans/restricted-scan-options";
import { getOrganizationSettings } from "../../../../server/settings/get-organization-settings";

type ScanDetailPageProps = {
  params: Promise<{ scanId: string }>;
};

function legacyScanHref(scanId: string) {
  return `/app/scanso/${encodeURIComponent(scanId)}`;
}

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const [{ scanId }, { membership, organization, user }] = await Promise.all([
    params,
    withServerTiming("app.scan_detail.context", () => getDashboardContext()),
  ]);
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const statusProjection = await withServerTiming("app.scan_detail.status_projection", () =>
    isPlatformAdmin
      ? getPublicScanStatusProjection(scanId)
      : getOrganizationScanStatusProjection({ organizationId: organization.id, scanId })
  );
  if (!statusProjection) notFound();

  const waitingForReportProjection =
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !statusProjection.reportReady;
  if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection) {
    return (
      <>
        <PendingScanStartedEvent />
        <PendingScanDetailView
          fullSite={(await readFullSiteOptions()).allowed ? statusProjection.fullSite : undefined}
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
      </>
    );
  }

  if (!isCompletedScanStatus(statusProjection.status)) {
    redirect(legacyScanHref(scanId));
  }

  const [persistedReportProjection, organizationSettings] = await Promise.all([
    statusProjection.reportReady
      ? withServerTiming("app.scan_detail.persisted_projection", () =>
          loadPersistedScanReportProjection({
            generation: statusProjection.reportGeneration,
            organizationId: isPlatformAdmin ? null : organization.id,
            scanId,
          })
        )
      : Promise.resolve(null),
    getOrganizationSettings(organization.id),
  ]);

  if (!persistedReportProjection) {
    if (!statusProjection.reportProjectionRequired) redirect(legacyScanHref(scanId));
    return (
      <PendingScanDetailView
          fullSite={(await readFullSiteOptions()).allowed ? statusProjection.fullSite : undefined}
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
    );
  }

  let report;
  try {
    report = buildTimelineReportModel(persistedReportProjection);
  } catch {
    redirect(legacyScanHref(scanId));
  }

  return (
    <>
      <PendingScanStartedEvent />
      <ScanProgressReportVisible scanId={scanId} />
      <ShadowScanReport
        allowRestrictedScanOptions={canUseRestrictedScanOptions({
          membershipRole: membership.role,
          userEmail: user.email,
        })}
        defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
        mode="authenticated"
        report={(await readFullSiteOptions()).allowed ? report : { ...report, fullSite: undefined }}
        variant="timeline"
      />
    </>
  );
}
