import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { DomainScanForm } from "../../../components/marketing/domain-scan-form";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Start a website scan | CertScore.ai",
    description:
      "Start a CertScore.ai public website scan for observable privacy, consent, tracking, cookie, and GDPR/ePrivacy review signals.",
    path: "/scan"
  }),
  robots: {
    follow: true,
    index: false
  }
};

type ScanEntryPageProps = {
  searchParams?: Promise<{
    domain?: string;
  }>;
};

function normalizeInitialDomain(value: string | undefined) {
  return value?.trim().slice(0, 160) ?? "";
}

export default async function ScanEntryPage({ searchParams }: ScanEntryPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialDomain = normalizeInitialDomain(resolvedSearchParams.domain);

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="max-w-2xl space-y-3">
          <Badge tone="neutral">Website scan</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Scan a public website.</h1>
          <p className="text-sm leading-6 text-slate-600">
            CertScore.ai observes public website behavior for evidence-led GDPR/ePrivacy review signals. Automated results should be reviewed before relying on them.
          </p>
        </div>

        <Card className="mt-8 border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">
              {initialDomain ? `Ready to scan ${initialDomain}` : "Enter a website to scan"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DomainScanForm
              buttonLabel="Scan a website"
              helperText="With JavaScript enabled, CertScore.ai starts the scan and opens the report automatically."
              initialDomain={initialDomain}
              inputLabel="Website to analyze"
              inputPlaceholder="Enter website here"
              mode="full"
              scanSource="homepage"
            />
            <p className="text-xs leading-5 text-slate-500">
              The scan form is available in server-rendered HTML. The interactive scan queue uses the browser session to start the live report.
            </p>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
