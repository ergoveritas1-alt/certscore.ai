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

const title = "Session replay risk benchmark notes 2026";
const description =
  "Cautious CertScore.ai benchmark notes on observed session recording and session replay risk signals in public website scans.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/benchmarks/session-replay-risk-2026"
  }),
  title: {
    absolute: "Session replay risk benchmark notes 2026 | CertScore.ai"
  }
};

export default function SessionReplayRiskBenchmarkPage() {
  const schema = [
    createPublicArticleSchema({
      title,
      description,
      path: "/benchmarks/session-replay-risk-2026"
    }),
    createBenchmarkDatasetSchema({
      title,
      description,
      path: "/benchmarks/session-replay-risk-2026"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Benchmarks", path: "/benchmarks" },
      { name: title, path: "/benchmarks/session-replay-risk-2026" }
    ])
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Benchmark notes"
        intro="CertScore.ai benchmark notes describe observed public website behavior around session recording services and higher-urgency replay-related review signals."
        relatedLinks={[
          { href: "/guides/session-replay-risk", label: "session replay risk" },
          { href: "/guides/privacy-scanner-vs-cookie-scanner", label: "privacy scanner vs cookie scanner" },
          { href: "/benchmarks/website-consent-tracking-2026", label: "website consent benchmark" },
          { href: "/methodology", label: "CertScore methodology" }
        ]}
        schema={schema}
        sections={[
          {
            title: "Direct answer",
            paragraphs: [
              "Session replay risk signals appear when a scan observes session recording technology or more sensitive replay-related behavior that should be reviewed in context.",
              "In recent CertScore.ai benchmark notes, severe session replay on sensitive input surfaces remained rare, while broader session recording service detection should still be reviewed with evidence."
            ]
          },
          {
            title: "Why it matters",
            paragraphs: [
              "Session recording tools can be configured with masking, suppression, consent gating, and page-level rules that automated scans cannot fully infer.",
              "Observed replay-related signals are useful triage prompts for reviewing whether controls match the intended user experience."
            ]
          },
          {
            title: "What CertScore observes",
            paragraphs: [
              "CertScore.ai observes public page context, recording-related vendors or scripts, timing, and whether behavior appears near sensitive input surfaces where evidence is available.",
              "CertScore findings remain automated signals for review, not legal advice, certification, or compliance determinations."
            ]
          },
          {
            title: "Example evidence",
            paragraphs: [
              "A sanitized example might show a session recording script loaded on a public form page.",
              "Another example might show replay-related activity near an account or checkout-style input surface, prompting review of masking and consent controls."
            ]
          },
          {
            title: "What teams should review next",
            paragraphs: [
              "Review vendor configuration, field masking, page exclusions, consent gating, and whether sensitive flows are covered by suppression controls.",
              "Compare the scan observation with the vendor console and frontend implementation before assigning remediation."
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
            <p>Signal family: session recording and session replay risk.</p>
            <p>Approximate recent benchmark frequency: severe sensitive-input replay signals were rare.</p>
            <p>Interpretation: higher-urgency review cue when supported by retained evidence.</p>
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
