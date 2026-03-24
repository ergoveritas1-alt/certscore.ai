import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PreviewScanState } from "../../../../components/marketing/preview-scan-state";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { PendingButtonLink } from "../../../../components/ui/pending-link";
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
  const fullScanRecord =
    scan && scan.status !== "queued" && scan.status !== "running"
      ? await getAnonymousScanById(scan.scanId)
      : null;
  const loginHref = scan
    ? `/login?${new URLSearchParams({
        domain: scan.hostname,
        next: "/app",
        previewScanId: scan.scanId
      }).toString()}`
    : null;

  return (
    <main className="min-h-screen bg-sand">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        {scan ? (
          scan.status === "queued" || scan.status === "running" ? (
            <PreviewScanState initialScan={scan} />
          ) : loginHref && fullScanRecord ? (
            <SharedScanDetailView
              headerActions={
                <div className="flex flex-col gap-3 sm:flex-row">
                  <PendingButtonLink href={loginHref} idleContent="Create account to continue" pendingContent="Opening..." />
                  <PendingButtonLink
                    href={loginHref}
                    idleContent="Already have an account? Sign in"
                    pendingContent="Opening..."
                    variant="secondary"
                  />
                </div>
              }
              scanRecord={fullScanRecord}
            />
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
