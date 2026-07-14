import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  INLINE_METHODOLOGY_SUMMARY,
  PUBLIC_METHODOLOGY_SECTIONS,
  REVIEWER_METHODOLOGY_SECTIONS
} from "@website-signal-risk-scanner/shared";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  description:
    "Review CertScore.ai methodology for evidence collection, structured findings, confidence scoring, and scan limitations.",
  path: "/methodology",
  title: "Methodology"
});

const deeperInsights = [
  {
    eyebrow: "Unexpected Vendor Signals",
    title: "Surface tracking and vendor behavior that merits closer review.",
    description:
      "Use retained runtime evidence to review scripts, requests, and vendor activity that appear outside the expected website stack."
  },
  {
    eyebrow: "Consent Flow Review",
    title: 'Identify when a "Privacy Request Form" or "Reject" path may be missing.',
    description:
      "Spot consent journeys where user controls appear absent, incomplete, or inconsistent with the public-facing path the site presents."
  },
  {
    eyebrow: "Trust And Disclosure Context",
    title: "Use public website signals to support broader trust and diligence review.",
    description:
      "Use scan evidence as an early signal when weak consent, disclosure, or accessibility posture may be contributing to trust, diligence, or discoverability concerns."
  }
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Methodology</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore.ai methodology for structured findings.</h1>
            <p className="text-lg leading-8 text-slate-600">{INLINE_METHODOLOGY_SUMMARY}</p>
            <p className="text-sm leading-7 text-slate-500">
              This page explains what CertScore.ai tests, what “not detected” means, how evidence is retained, how confidence is assigned,
              and why the product avoids certification or legal pass/fail language.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <Card className="mb-5 border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl text-slate-950">How findings are surfaced</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm leading-7 text-slate-600">
            CertScore.ai does not treat every raw detector output as a report finding. Observed signals are evaluated using evidence thresholds,
            support strength, contradiction checks, and scan-context limits. Depending on the retained evidence, an item may be surfaced as a
            finding, held for reviewer attention, used as supporting context, or suppressed.
          </CardContent>
        </Card>
        <div className="grid gap-5">
          {PUBLIC_METHODOLOGY_SECTIONS.map((section) => (
            <Card key={section.heading} className="border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl text-slate-950">{section.heading}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm leading-7 text-slate-600">{section.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Deeper insights</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Use scan evidence to support deeper review.</h2>
            <p className="text-sm text-slate-600">
              CertScore.ai can do more than surface obvious findings. It helps teams connect runtime evidence to broken user controls, disclosure gaps, and broader public-facing trust signals.
            </p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {deeperInsights.map((item, index) => (
              <Card
                key={item.eyebrow}
                className={
                  index === 0
                    ? "relative overflow-hidden border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                    : index === 1
                      ? "relative overflow-hidden border border-emerald-100 bg-[linear-gradient(180deg,rgba(249,253,250,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                      : "relative overflow-hidden border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                }
              >
                <div
                  aria-hidden="true"
                  className={
                    index === 0
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(245,158,11,0.72)_0%,rgba(251,191,36,0.5)_100%)]"
                      : index === 1
                        ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.78)_0%,rgba(124,207,121,0.48)_100%)]"
                        : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.8)_0%,rgba(103,199,240,0.46)_100%)]"
                  }
                />
                <CardHeader className="space-y-2 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.eyebrow}</p>
                  <CardTitle className="text-base leading-5 tracking-tight text-slate-950">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 text-[13px] leading-5 text-slate-600">{item.description}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Reviewer Notes</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Additional reviewer-facing context</h2>
          </div>
          <div className="mt-8 grid gap-5">
            {REVIEWER_METHODOLOGY_SECTIONS.map((section) => (
              <Card key={section.heading} className="border-slate-200 bg-slate-50 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-slate-950">{section.heading}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-7 text-slate-600">{section.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <Card className="border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.92)_100%)] shadow-none">
          <CardContent className="flex flex-col gap-4 px-6 py-6 text-sm leading-7 text-slate-600 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="font-medium text-slate-900">Need the product overview too?</p>
              <p>This methodology explains how findings are produced. The product walkthrough shows how those findings appear in CertScore.ai.</p>
            </div>
            <Link href="/how-it-works" className="text-sm font-medium text-sky-700 hover:text-sky-800">
              View how it works
            </Link>
          </CardContent>
        </Card>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-sky-700">
          <Link href="/guides/detect-tracking-before-consent" className="hover:text-sky-800">
            Detect tracking before consent
          </Link>
          <Link href="/guides/website-consent-audit-checklist" className="hover:text-sky-800">
            Website consent audit checklist
          </Link>
          <Link href="/benchmarks/session-replay-risk-2026" className="hover:text-sky-800">
            Session replay risk benchmark
          </Link>
          <Link href="/compare/website-consent-audit-tools" className="hover:text-sky-800">
            Website consent audit tools
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
