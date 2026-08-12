import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { ApiReadRatePolicyNotice } from "../../components/api-read-rate-policy-notice";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Sample Website Risk Signal Report",
  description:
    "Review a sample CertScore.ai report showing automated public-web observations for consent behavior, third-party requests, cookies, disclosures, and accessibility signals.",
  path: "/sample-report"
});

const summaryStats = [
  { label: "Consent timing", value: "Pre-choice activity observed" },
  { label: "Vendor footprint", value: "12 third-party hosts" },
  { label: "Reject path", value: "Changed some behavior" },
  { label: "Review priority", value: "Needs follow-up" }
];

const evidenceRows = [
  {
    signal: "Tracking before consent",
    observation: "Marketing and analytics requests appeared before a consent choice interaction.",
    evidence: "First request at 420ms after page load; example hosts include tag-manager.example and ads.example."
  },
  {
    signal: "Reject behavior",
    observation: "Rejecting the banner reduced some requests, but several third-party calls still appeared afterward.",
    evidence: "After-reject scan retained collection endpoints from two observed vendor domains."
  },
  {
    signal: "Cookie and storage activity",
    observation: "Non-essential-looking cookies and local storage keys were observed during the page session.",
    evidence: "Cookie names and storage keys are grouped by category when the scanner has enough context."
  },
  {
    signal: "Disclosure consistency",
    observation: "The privacy text described analytics and advertising tooling, but observed runtime behavior should be reviewed against current configuration.",
    evidence: "Policy snippets are retained with source URLs for human review."
  },
  {
    signal: "Accessibility signals",
    observation: "Automated checks found several page-level accessibility signals that may deserve product review.",
    evidence: "Examples include missing alt text, heading-order issues, or contrast warnings where observed."
  }
];

const monitoringExamples = [
  "New vendor appeared on page load",
  "Reject-path behavior changed",
  "Cookie category changed",
  "Disclosure page changed",
  "Accessibility signal count changed"
];

export default function SampleReportPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-5">
            <Badge tone="neutral">Sample report</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              What a CertScore.ai evidence report gives your team.
            </h1>
            <p className="text-lg leading-8 text-slate-600">
              This sample shows the shape of a review packet: automated public-web observations, retained evidence, and clear next-step signals for privacy, product, agency, or security review.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04] sm:w-auto"
                href="/#homepage-scan"
                idleContent="Start a trial scan"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="w-full border-slate-300 bg-white text-slate-900 hover:bg-slate-100 sm:w-auto"
                data-analytics-cta-type="monitor"
                data-analytics-event="report_cta_clicked"
                href="/monitor-site?source=sample-report"
                idleContent="Request monitoring"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <p className="text-sm leading-6 text-slate-500">
              Sample content is illustrative. CertScore.ai surfaces observations for review and does not provide legal advice, certification, or compliance determinations.
            </p>
          </div>

          <Card className="border-slate-200 bg-slate-50 shadow-none">
            <CardHeader>
              <CardTitle>Executive snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{stat.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Evidence table</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Signals a buyer can review without rerunning a manual audit.</h2>
          <p className="text-sm leading-6 text-slate-600">
            CertScore.ai reports are designed to make the observed browser behavior easy to triage, reproduce, and discuss with implementation owners.
          </p>
        </div>

        <Card className="mt-8 border-slate-200 bg-white shadow-none">
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Signal</th>
                  <th className="px-5 py-4 font-medium">Observation</th>
                  <th className="px-5 py-4 font-medium">Evidence retained</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evidenceRows.map((row) => (
                  <tr key={row.signal} className="align-top">
                    <td className="min-w-[12rem] px-5 py-4 font-semibold text-slate-950">{row.signal}</td>
                    <td className="min-w-[18rem] px-5 py-4 leading-6 text-slate-600">{row.observation}</td>
                    <td className="min-w-[18rem] px-5 py-4 leading-6 text-slate-600">{row.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="space-y-3">
            <Badge tone="neutral">Monitoring value</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">The same report becomes more useful over time.</h2>
            <p className="text-sm leading-6 text-slate-600">
              One scan answers what happened during one run. Monitoring helps teams see whether the public behavior changed after tag updates, consent changes, vendor rollouts, or site releases.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {monitoringExamples.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-800">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <Card className="border-sky-100 bg-[linear-gradient(135deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-none">
          <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Ready to see your own public-site signals?</h2>
              <p className="text-sm leading-6 text-slate-600">
                Start with a trial scan, then use pricing to choose a scoped review or monitoring path.
              </p>
            </div>
            <PendingButtonLink
              className="w-full border-0 bg-slate-950 text-white hover:bg-slate-800 sm:w-auto"
              data-analytics-cta-type="pricing"
              data-analytics-event="report_cta_clicked"
              href="/pricing"
              idleContent="View pricing"
              pendingContent="Opening..."
            />
          </CardContent>
        </Card>
        <ApiReadRatePolicyNotice className="mt-8" />
      </section>

      <SiteFooter />
    </main>
  );
}
