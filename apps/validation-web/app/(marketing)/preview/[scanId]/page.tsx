import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PreviewScanResolvedState } from "../../../../components/marketing/preview-scan-resolved-state";
import { PreviewScanState } from "../../../../components/marketing/preview-scan-state";
import { SiteHeader } from "../../../../components/layout/site-header";
import { getPreviewScan } from "../../../../server/preview-scan/get-preview-scan";

export const dynamic = "force-dynamic";

type PreviewScanPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function PreviewScanPage({ params }: PreviewScanPageProps) {
  const { scanId } = await params;
  const scan = await getPreviewScan(scanId);
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
          ) : loginHref ? (
            <PreviewScanResolvedState loginHref={loginHref} scan={scan} />
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
    </main>
  );
}
