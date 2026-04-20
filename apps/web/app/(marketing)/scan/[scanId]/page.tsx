import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function PublicScanDetailPage({ params }: PublicScanDetailPageProps) {
  const { scanId } = await params;
  const scanRecord = await getAnonymousScanById(scanId);

  if (!scanRecord) {
    notFound();
  }

  const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
  await persistReportFindingCount({
    count: reportFindingCount,
    scanId: scanRecord.scan.id
  });

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-6">
        <SharedScanDetailView
          autoRefresh={<ScanStatusAutoRefresh status={scanRecord.scan.status} />}
          headerActions={
            scanRecord.scan.status === "completed" ? (
              <div className="w-full max-w-[21rem]">
                <DomainScanForm
                  buttonLabel="Scan"
                  compact
                  inputLabel="Scan another website"
                  inputPlaceholder="Enter another site"
                  mode="full"
                />
              </div>
            ) : null
          }
          scanRecord={scanRecord}
        />
      </section>
      <SiteFooter />
    </main>
  );
}
