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
  "CertScore.ai benchmark frequencies for observed pre-consent tracking, RTB cookie sync, fingerprinting signals, session replay risk, and related public-web review signals.";

const benchmarkRows = [
  {
    definition:
      "Non-essential third-party tracking or identifier-bearing requests observed before a clear user consent action.",
    frequency: "~20%",
    interpretation: "Common consent-timing review signal; review vendor necessity, CMP timing, and default firing rules.",
    signal: "Pre-consent tracking"
  },
  {
    definition: "Third-party cookies or cookie-like identifiers observed before a consent action.",
    frequency: "~12%",
    interpretation:
      "More specific cookie-layer subset of pre-consent tracking; useful for reviewing consent gating and tag manager rules.",
    signal: "Third-party cookies before consent"
  },
  {
    definition:
      "Adtech synchronization behavior consistent with vendors mapping identifiers across domains or partners.",
    frequency: "~10%",
    interpretation:
      "Higher-signal advertising ecosystem telemetry; review consent basis, vendor disclosures, and whether sync behavior is expected.",
    signal: "RTB cookie sync"
  },
  {
    definition: "Session recording / replay vendor activity or instrumentation observed during the automated scan.",
    frequency: "~14%",
    interpretation: "Broad replay-service presence signal; not necessarily sensitive-input capture by itself.",
    signal: "Session recording services detected"
  },
  {
    definition:
      "Browser, device, canvas/WebGL, hardware, viewport, locale, storage, or network-surface telemetry that can be fingerprinting-adjacent.",
    frequency: "~17%",
    interpretation:
      "Broad review signal; intentionally includes lower-confidence telemetry and should not be treated as confirmed fingerprinting.",
    signal: "Fingerprinting-related signals"
  },
  {
    definition:
      "Consent interface review signal where rejecting or declining tracking appears unavailable, difficult to access, or placed behind additional preference steps.",
    frequency: "~4%",
    interpretation: "Choice-architecture review signal; confirm actual CMP configuration and regional behavior.",
    signal: "Reject option missing or hidden"
  },
  {
    definition:
      "Higher-confidence fingerprinting subset supported by stronger evidence such as high-entropy telemetry, known vendor corroboration, identifier shaping, transmission, or cross-context linkage.",
    frequency: "~1%",
    interpretation: "Conservative signal; should remain much lower than broad fingerprinting-related signals.",
    signal: "Probable fingerprinting"
  },
  {
    definition:
      "Higher-urgency subset where replay/session-recording activity appears near sensitive input surfaces such as forms collecting personal, account, financial, health, or similar sensitive information.",
    frequency: "~1%",
    interpretation: "Uncommon but high-priority review signal when supported by evidence.",
    signal: "Severe session replay on sensitive input surfaces"
  }
];

const datasetNotes = [
  "Current estimates are based on recent CertScore benchmark scan batches across public websites, with emphasis on Tranco-rank benchmark ranges used for calibration.",
  "Percentages are approximate and will be refreshed as the benchmark corpus grows.",
  "Homepage-oriented scans can undercount behavior that appears only after navigation, login, checkout, geolocation changes, or delayed consent interactions."
];

const readingNotes = [
  "Percentages are approximate, not population-wide claims.",
  "Signals are derived from automated public-web observations.",
  "Some behavior may be undercounted because scans are homepage-oriented.",
  "Blocking, bot defenses, geolocation, CMP personalization, and delayed tag firing can affect observed rates.",
  "A finding's frequency is not the same as legal risk; it is a benchmark context point for evidence review."
];

const definitions = [
  {
    description:
      "Pre-consent tracking means non-essential third-party tracking or identifier-bearing requests observed before a clear user consent action. CertScore uses observable public-web behavior, and consent state, geography, CMP behavior, and scan coverage can affect results.",
    title: "Pre-consent tracking"
  },
  {
    description:
      "RTB cookie sync means adtech identifier synchronization behavior, usually involving redirect, pixel, or server calls that appear designed to map identifiers across vendors or domains. It is an observed behavior that requires context review.",
    title: "RTB cookie sync"
  },
  {
    description:
      "Fingerprinting-related signals are intentionally broad: browser, device, canvas/WebGL, hardware, viewport, locale, storage, or network-surface telemetry that may warrant review. Probable fingerprinting is a conservative higher-confidence subset supported by stronger corroborating evidence.",
    title: "Fingerprinting-related signals vs probable fingerprinting"
  },
  {
    description:
      "Session recording services detected is a broad vendor-presence or instrumentation signal. Sensitive-input session replay is a higher-urgency subset where replay-like activity appears near sensitive input surfaces.",
    title: "Session recording services vs sensitive-input session replay"
  },
  {
    description:
      "Reject option missing or hidden is a consent-interface review signal where declining tracking appears unavailable, difficult to access, or placed behind additional preference steps. Confirm the actual CMP configuration and regional behavior before acting.",
    title: "Reject option missing or hidden"
  },
  {
    description:
      "Third-party cookies before consent is a cookie-layer subset of pre-consent tracking where third-party cookies or cookie-like identifiers are observed before a consent action.",
    title: "Third-party cookies before consent"
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
        intro="Observed frequencies from automated homepage-oriented scans of public websites. Findings are evidence-backed review signals, not legal conclusions."
        schema={schema}
        sections={[
          {
            title: "Observed benchmark signals",
            paragraphs: [
              "In recent CertScore.ai benchmark scans, pre-consent tracking appeared in approximately 20% of scanned sites, while third-party cookies before consent appeared in approximately 12%.",
              "RTB cookie sync appeared in approximately 10% of recent benchmark scans, providing a higher-signal advertising ecosystem review cue.",
              "Fingerprinting-related signals appeared in approximately 17% of scans. Probable fingerprinting appeared in approximately 1% of recent benchmark scans, reflecting a deliberately conservative higher-confidence threshold.",
              "Session recording services were detected in approximately 14% of recent benchmark scans. Severe session replay on sensitive input surfaces appeared in approximately 1% of recent benchmark scans. Although uncommon, this remains a high-priority review signal when evidence shows replay activity near sensitive fields."
            ]
          },
          {
            title: "Methodology caveats",
            paragraphs: [
              "These estimates are based on automated homepage-oriented scans of public websites. Results vary by site category, geography, scan coverage, blocking, consent surface, and scanner access.",
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
        <Card className="mb-5 border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Dataset note</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-7 text-slate-600">
              {datasetNotes.map((note) => (
                <li key={note} className="flex gap-3">
                  <span className="mt-[0.7rem] h-1.5 w-1.5 flex-none rounded-full bg-sky-500" aria-hidden="true" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Citation-friendly benchmark table</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Signal</th>
                  <th className="py-3 pr-4 font-semibold">Approx. observed frequency</th>
                  <th className="py-3 pr-4 font-semibold">Signal definition</th>
                  <th className="py-3 font-semibold">Interpretation / review note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {benchmarkRows.map((row) => (
                  <tr key={row.signal}>
                    <td className="w-[13rem] py-4 pr-4 align-top font-medium text-slate-900">{row.signal}</td>
                    <td className="w-[9rem] py-4 pr-4 align-top font-semibold text-slate-950">{row.frequency}</td>
                    <td className="w-[22rem] py-4 pr-4 align-top">{row.definition}</td>
                    <td className="py-4 align-top">{row.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">How to read these estimates</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm leading-7 text-slate-600">
                {readingNotes.map((note) => (
                  <li key={note} className="flex gap-3">
                    <span className="mt-[0.7rem] h-1.5 w-1.5 flex-none rounded-full bg-sky-500" aria-hidden="true" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm leading-7 text-slate-600">
              {definitions.map((definition) => (
                <div key={definition.title}>
                  <h2 className="text-base font-semibold text-slate-950">{definition.title}</h2>
                  <p className="mt-1">{definition.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
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
