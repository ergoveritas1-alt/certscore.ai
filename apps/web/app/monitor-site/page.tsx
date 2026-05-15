import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { MonitorSiteForm } from "../../components/monitor-site/monitor-site-form";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Monitor a Website",
  description: "Request a CertScore.ai follow-up about monitoring public website tracking, cookie, consent, accessibility, and disclosure signals.",
  path: "/monitor-site"
});

type MonitorSitePageProps = {
  searchParams: Promise<{
    reportUrl?: string;
    source?: string;
    website?: string;
  }>;
};

export default async function MonitorSitePage({ searchParams }: MonitorSitePageProps) {
  const params = await searchParams;
  const defaultWebsite = typeof params.website === "string" ? params.website.slice(0, 200) : "";
  const sourcePageUrl = typeof params.source === "string" ? params.source.slice(0, 1000) : "";
  const sourceReportUrl = typeof params.reportUrl === "string" ? params.reportUrl.slice(0, 1000) : "";

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Monitoring request</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Monitor this site for changes</h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Create a pending monitoring request for public-web observations over time, including tracking, cookies, consent behavior, accessibility, and disclosure signals.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.7fr]">
            <Card className="relative overflow-hidden border border-slate-200 bg-white shadow-none">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
              <CardHeader>
                <CardTitle>Request monitoring follow-up</CardTitle>
              </CardHeader>
              <CardContent>
                <MonitorSiteForm
                  defaultWebsite={defaultWebsite}
                  sourcePageUrl={sourcePageUrl}
                  sourceReportUrl={sourceReportUrl}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">What this request means</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
                <p>We will add the site to a pending monitoring review queue and follow up about setup options.</p>
                <p>Submitting this form creates a pending monitoring request. It does not activate monitoring, schedule scans, or change any existing scan results.</p>
                <p>Monitoring is not active until setup is confirmed with you. CertScore reports remain automated public-web observations for review, not legal advice.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
