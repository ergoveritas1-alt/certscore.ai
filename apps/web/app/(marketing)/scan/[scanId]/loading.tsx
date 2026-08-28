import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { ScanReportLoadingCard } from "../../../../components/scans/scan-report-loading-card";

export default function PublicScanLoading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl items-center justify-center px-6 py-16">
        <ScanReportLoadingCard
          description="The report is ready; we’re loading its retained findings and evidence."
          title="Loading report"
          variant="report"
        />
      </section>
      <SiteFooter />
    </main>
  );
}
