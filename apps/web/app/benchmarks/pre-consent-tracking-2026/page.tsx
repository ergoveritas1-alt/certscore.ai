import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import {
  AiVisibilityContent,
  DisclaimerBlock,
  WebsiteBehaviorScanCta
} from "../../../components/marketing/ai-visibility-content";
import {
  createBenchmarkDatasetSchema,
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema
} from "../../../lib/seo";

const title = "Pre-consent tracking benchmark notes 2026";
const description =
  "Cautious CertScore.ai benchmark notes on observed pre-consent tracking signals in automated public website scans.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/benchmarks/pre-consent-tracking-2026"
  }),
  title: {
    absolute: "Pre-consent tracking benchmark notes 2026 | CertScore.ai"
  }
};

export default function PreConsentTrackingBenchmarkPage() {
  const schema = [
    createPublicArticleSchema({
      title,
      description,
      path: "/benchmarks/pre-consent-tracking-2026"
    }),
    createBenchmarkDatasetSchema({
      title,
      description,
      path: "/benchmarks/pre-consent-tracking-2026"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Benchmarks", path: "/benchmarks" },
      { name: title, path: "/benchmarks/pre-consent-tracking-2026" }
    ])
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Benchmark notes"
        intro="CertScore.ai benchmark notes describe how often selected automated public website risk signals appeared in recent scan batches. Pre-consent tracking is a review signal for activity observed before a recorded consent choice."
        relatedLinks={[
          { href: "/guides/pre-consent-tracking", label: "pre-consent tracking guide" },
          { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
          { href: "/guides/third-party-cookies-before-consent", label: "third-party cookies before consent" },
          { href: "/methodology", label: "CertScore methodology" }
        ]}
        schema={schema}
        sections={[
          {
            title: "Direct answer",
            paragraphs: [
              "Pre-consent tracking means classified tracking requests, vendor activity, or non-essential cookies appear before the scan records a consent choice.",
              "In recent CertScore.ai benchmark scans, this signal appeared in roughly one in five scanned sites. That frequency is directional and should not be treated as a legal conclusion about any website."
            ]
          },
          {
            title: "Why it matters",
            paragraphs: [
              "Tracking before consent can indicate drift between consent-platform settings, tag-manager rules, and live website behavior.",
              "Benchmark context helps teams understand that this is a common operational review issue rather than a rare edge case."
            ]
          },
          {
            title: "What CertScore observes",
            paragraphs: [
              "CertScore.ai observes request timing, cookie timing, consent-surface signals, vendor-like hosts, and retained evidence from public website scans.",
              "Findings are automated risk signals for review and are not legal advice, certification, or compliance determinations."
            ]
          },
          {
            title: "Example evidence",
            paragraphs: [
              "A sanitized example might show analytics.example/collect firing during initial page load before any banner interaction.",
              "Another example might show a third-party marketing cookie present before the scan records an accept or reject choice."
            ]
          },
          {
            title: "What teams should review next",
            paragraphs: [
              "Review tag-manager triggers, consent categories, vendor deployment rules, cookie timing, and whether geography or stored consent state affected the scan.",
              "Repeat scans after changes to confirm whether the observed signal changed."
            ]
          }
        ]}
        showDisclaimer={false}
        title={title}
      />
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Benchmark interpretation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-7 text-slate-600">
            <p>Signal: pre-consent tracking.</p>
            <p>Approximate recent benchmark frequency: roughly one in five scanned sites.</p>
            <p>Interpretation: common automated review signal that should be checked against retained evidence.</p>
          </CardContent>
        </Card>
        <div className="mt-5">
          <WebsiteBehaviorScanCta />
        </div>
        <div className="mt-5">
          <DisclaimerBlock />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
