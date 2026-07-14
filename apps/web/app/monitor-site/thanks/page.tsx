import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, CardContent } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Monitoring Request Sent",
  description: "Confirmation page for a CertScore.ai website monitoring follow-up request.",
  path: "/monitor-site/thanks",
  robots: {
    index: false,
    follow: false
  }
});

type MonitorSiteThanksPageProps = {
  searchParams: Promise<{
    statusToken?: string;
    website?: string;
  }>;
};

export default async function MonitorSiteThanksPage({ searchParams }: MonitorSiteThanksPageProps) {
  const params = await searchParams;
  const statusToken =
    typeof params.statusToken === "string" && /^[A-Za-z0-9_-]{20,120}$/.test(params.statusToken) ? params.statusToken : "";
  const website = typeof params.website === "string" ? params.website.slice(0, 200) : "";

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="space-y-5 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Request sent</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Thanks. We’ll follow up about monitoring{website ? ` ${website}` : " this site"}.
            </h1>
            <p className="text-sm leading-7 text-slate-600">
              We received your monitoring request and added it to the pending monitoring review queue. Monitoring is not active until setup is confirmed with you.
            </p>
            <p className="text-sm leading-7 text-slate-600">
              CertScore.ai uses automated public-web observations as review signals. This is not legal advice and should be reviewed with the underlying evidence.
            </p>
            <div className="flex flex-wrap gap-3">
              {statusToken ? (
                <Button asChild>
                  <Link href={`/monitor-site/status/${encodeURIComponent(statusToken)}`}>View request status</Link>
                </Button>
              ) : null}
              <Button asChild variant={statusToken ? "secondary" : "primary"}>
                <Link href="/">Run another scan</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/guides/website-consent-audit-checklist">Review the checklist</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
