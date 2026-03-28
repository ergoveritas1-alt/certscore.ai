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

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Methodology</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Evidence-led methodology for structured findings.</h1>
            <p className="text-lg leading-8 text-slate-600">{INLINE_METHODOLOGY_SUMMARY}</p>
            <p className="text-sm leading-7 text-slate-500">
              This page explains what CertScore tests, what “not detected” means, how evidence is retained, how confidence is assigned,
              and why the product avoids legal certification or legal pass/fail language.
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
            CertScore does not treat every raw detector output as a report finding. Observed signals are evaluated using evidence thresholds,
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
      </section>

      <SiteFooter />
    </main>
  );
}
