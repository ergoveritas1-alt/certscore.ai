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

const title = "Website consent and tracking benchmark notes 2026";
const description =
  "Cautious CertScore.ai benchmark notes on observed pre-consent tracking, RTB cookie sync, fingerprinting-related signals, and session replay risk signals.";

const benchmarkRows = [
  {
    frequency: "~20%",
    interpretation: "Common review signal in recent benchmark scans",
    signal: "Pre-consent tracking"
  },
  {
    frequency: "~10%",
    interpretation: "Higher-signal adtech telemetry requiring evidence review",
    signal: "RTB cookie sync"
  },
  {
    frequency: "~17%",
    interpretation: "Broad review signal, not the same as probable fingerprinting",
    signal: "Fingerprinting-related signals"
  },
  {
    frequency: "Rare",
    interpretation: "Higher-confidence subset that should remain conservative",
    signal: "Probable fingerprinting"
  },
  {
    frequency: "Rare",
    interpretation: "High-urgency review signal when supported by evidence",
    signal: "Severe session replay on sensitive input surfaces"
  }
];

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/benchmarks/website-consent-tracking-2026"
  }),
  title: {
    absolute: "Website consent and tracking benchmark notes 2026 | CertScore.ai"
  }
};

export default function WebsiteConsentTrackingBenchmarkPage() {
  const schema = [
    createPublicArticleSchema({
      title,
      description,
      path: "/benchmarks/website-consent-tracking-2026"
    }),
    createBenchmarkDatasetSchema({
      title,
      description,
      path: "/benchmarks/website-consent-tracking-2026"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Benchmarks", path: "/benchmarks" },
      { name: title, path: "/benchmarks/website-consent-tracking-2026" }
    ])
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Benchmark notes"
        intro="CertScore.ai analyzed recent benchmark scan batches across public websites to understand how often selected consent, tracking, and privacy telemetry risk signals appeared."
        schema={schema}
        sections={[
          {
            title: "Observed benchmark signals",
            paragraphs: [
              "In recent CertScore.ai benchmark scans, pre-consent tracking appeared in roughly one in five scanned sites.",
              "RTB cookie sync appeared in roughly one in ten scanned sites.",
              "Fingerprinting-related signals appeared in roughly 17% of scans, while probable fingerprinting remained rare.",
              "Severe session replay on sensitive input surfaces appeared rarely."
            ]
          },
          {
            title: "Methodology caveats",
            paragraphs: [
              "These were automated homepage-oriented scans. Results vary by site category, geography, scan coverage, blocking, consent surface, and scanner access.",
              "Findings are review signals, not legal conclusions. Site owners should review the underlying evidence and compare the observed behavior with their intended vendor, consent, and disclosure configuration."
            ]
          }
        ]}
        relatedLinks={[
          { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
          { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
          { href: "/benchmarks/pre-consent-tracking-2026", label: "pre-consent tracking 2026" },
          { href: "/benchmarks/session-replay-risk-2026", label: "session replay risk 2026" }
        ]}
        showDisclaimer={false}
        title={title}
      />
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Citation-friendly benchmark table</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Signal</th>
                  <th className="py-3 pr-4 font-semibold">Approx. benchmark frequency</th>
                  <th className="py-3 font-semibold">Interpretation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {benchmarkRows.map((row) => (
                  <tr key={row.signal}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{row.signal}</td>
                    <td className="py-3 pr-4">{row.frequency}</td>
                    <td className="py-3">{row.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-5 space-y-2 text-sm leading-6 text-slate-600">
              <p>Automated homepage-oriented scans.</p>
              <p>Results vary by site category, geography, scan coverage, blocking, consent surface, and scanner access.</p>
              <p>Findings are review signals, not legal conclusions.</p>
              <p>Benchmark frequencies are approximate and should be updated as the dataset grows.</p>
            </div>
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
