import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  DisclaimerBlock,
  WebsiteBehaviorScanCta
} from "../../components/marketing/ai-visibility-content";
import { getFindingDensityBenchmark } from "../../lib/scans/finding-density-benchmarks";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const title = "Press and media information";
const description =
  "Press and media information about CertScore.ai, a website risk-signal scanner for observable public website behavior.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/press"
  }),
  title: {
    absolute: "Press and media information | CertScore.ai"
  }
};

const scanCategories = [
  "Tracking requests and third-party activity",
  "Cookies before consent",
  "Public consent and policy surfaces",
  "Session recording and replay-related signals",
  "Fingerprinting-related signals",
  "Homepage accessibility signals",
  "Policy/runtime consistency review signals where evidence is available"
];

function benchmarkLabel(findingId: Parameters<typeof getFindingDensityBenchmark>[0]) {
  return getFindingDensityBenchmark(findingId)?.contextLabel.toLowerCase() ?? "observed in recent benchmark scans";
}

export default function PressPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/press`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Press</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Press and media information</h1>
          <p className="text-lg leading-8 text-slate-600">
            CertScore.ai scans public websites for observable pre-consent tracking, cookie and storage, public policy surface, accessibility, session recording, fingerprinting-related, and disclosure-consistency risk signals.
          </p>
        </div>

        <div className="mt-8">
          <WebsiteBehaviorScanCta />
        </div>

        <div className="mt-8 grid gap-5">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Boilerplate</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-600">
              CertScore.ai is a website risk-signal scanner that observes real website behavior around pre-consent tracking, cookies and storage, public policy surfaces, accessibility, session recording, fingerprinting-related signals, and disclosure consistency. CertScore.ai helps teams review automated evidence about how public websites behave, not just what policies claim.
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">What CertScore.ai scans</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">
                {scanCategories.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Benchmark highlights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              <p>Pre-consent tracking was {benchmarkLabel("pre_consent_tracking_detected")}.</p>
              <p>RTB cookie sync was {benchmarkLabel("rtb_cookie_sync_observed")}.</p>
              <p>
                Fingerprinting-related signals were {benchmarkLabel("fingerprinting_related_signals_observed")}, while probable fingerprinting was {benchmarkLabel("probable_fingerprinting")}.
              </p>
              <p>Session recording services were {benchmarkLabel("session_recording_services_detected")}.</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Contact</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-600">
              Media/contact: use the{" "}
              <Link href="/contact-sales" className="font-medium text-sky-700 hover:text-sky-800">
                Contact page
              </Link>
              .
            </CardContent>
          </Card>

          <WebsiteBehaviorScanCta />
          <DisclaimerBlock />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
