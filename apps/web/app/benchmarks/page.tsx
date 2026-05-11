import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  DisclaimerBlock,
  WebsiteBehaviorScanCta
} from "../../components/marketing/ai-visibility-content";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const title = "Website behavior benchmarks";
const description =
  "CertScore.ai benchmark notes summarize observed public website behavior trends around tracking, cookies, consent, accessibility, session recording, and fingerprinting-related signals.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/benchmarks"
  }),
  title: {
    absolute: "Website behavior benchmarks | CertScore.ai"
  }
};

export default function BenchmarksPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/benchmarks`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Benchmarks</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Website behavior benchmarks</h1>
          <p className="text-lg leading-8 text-slate-600">
            CertScore.ai benchmark notes summarize observed website behavior trends around tracking, cookies, consent, accessibility, session recording, and fingerprinting-related signals. These are automated homepage-oriented review signals, not legal conclusions.
          </p>
        </div>

        <div className="mt-8">
          <WebsiteBehaviorScanCta />
        </div>

        <div className="mt-8 grid gap-5">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Website consent and tracking benchmark notes 2026</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
              <p>
                Review cautious benchmark notes about observed pre-consent tracking, RTB cookie sync, fingerprinting-related signals, and session replay risk signals.
              </p>
              <Link href="/benchmarks/website-consent-tracking-2026" className="font-medium text-sky-700 hover:text-sky-800">
                Open the benchmark notes
              </Link>
            </CardContent>
          </Card>
          <DisclaimerBlock />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
