import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PLAN_DEFINITIONS } from "@website-signal-risk-scanner/shared";
import Link from "next/link";
import { Button } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Pricing",
  description: "Compare CertScore.ai plans for website signal scanning, scan cadence, and scan history.",
  path: "/pricing"
});

const comparisonRows = [
  { label: "Websites", values: { free: "1", pro: "3", team: "20" } },
  { label: "Pages per website", values: { free: "Up to 3", pro: "Up to 5", team: "Up to 5" } },
  { label: "Scan cadence", values: { free: "1 per month", pro: "On-demand, up to hourly", team: "On-demand, up to hourly" } },
  { label: "Scan history", values: { free: "Not included", pro: "Included", team: "Included" } }
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-4">
          <Badge tone="neutral">Simple limits, aligned with the product.</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-lg text-slate-600">
            Plans scale by website count, page coverage, scan cadence, and scan history.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
            >
              <Link href="/">Start with Free</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50"
            >
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {PLAN_DEFINITIONS.map((plan, index) => (
            <Card key={plan.code} className="relative overflow-hidden border-slate-200 bg-white shadow-none">
              <div
                aria-hidden="true"
                className={
                  index === 0
                    ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(148,163,184,0.22)_0%,rgba(226,232,240,0.4)_100%)]"
                    : index === 1
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]"
                      : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.18)_0%,rgba(124,207,121,0.28)_100%)]"
                }
              />
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.label}</span>
                  <span className="text-base font-medium text-slate-600">{plan.priceLabel}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <p>{plan.description}</p>
                <p>Websites: {plan.maxDomains}</p>
                <p>Pages per website: {plan.maxPagesPerScan}</p>
                <p>Scan cadence: {plan.scanFrequency === "manual" ? "Monthly" : "On-demand, up to hourly"}</p>
                <p>Scan history: {plan.code === "pro" || plan.scanHistoryEnabled ? "Included" : "Not included"}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 space-y-4">
          <div className="max-w-2xl space-y-2">
            <Badge tone="neutral">Comparison</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Plan details</h2>
          </div>
          <Card className="border-slate-200 bg-white shadow-none">
            <CardContent className="overflow-x-auto p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 font-medium">Free</th>
                    <th className="px-6 py-4 font-medium">Pro</th>
                    <th className="px-6 py-4 font-medium">Ultra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.label}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.free}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.pro}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.team}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
