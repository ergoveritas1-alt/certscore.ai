import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { ScanReportLoadingCard } from "../../../../components/scans/scan-report-loading-card";

export default function PublicScanLoading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl items-center justify-center px-6 py-16">
        <ScanReportLoadingCard
          description="We’re checking the scan’s current stage. Progress will appear as soon as the status is available."
          title="Loading scan status"
          variant="status"
        />
      </section>
      <SiteFooter />
    </main>
  );
}
