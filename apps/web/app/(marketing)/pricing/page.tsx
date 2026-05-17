import type { Metadata } from "next";
import { Badge, Card, CardContent } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Pricing",
  description: "Simple page-scan pricing for CertScore.ai public-web observations.",
  path: "/pricing"
});

const standardPlans = [
  {
    code: "starter",
    eyebrow: "Starter",
    price: "$40",
    priceNote: "per month",
    summary: "For teams that need repeatable page-level checks without a large volume commitment.",
    scanAllowance: "50 page scans / month",
    ctaHref: "/login",
    ctaLabel: "Get started",
    ctaType: "sign_in",
    plan: "starter",
    ctaClassName:
      "w-fit rounded-full border-0 bg-[#0f8bd7] px-5 text-white shadow-[0_10px_22px_rgba(15,139,215,0.24)] hover:bg-[#0b78bf]",
    highlights: [
      "50 included page scans each month",
      "Manual re-scans use included scan credits",
      "Show scan history for follow-up review"
    ]
  },
  {
    code: "pro",
    eyebrow: "Pro",
    price: "$200",
    priceNote: "per month",
    summary: "For ongoing review work, deeper page coverage, and recurring scan history.",
    scanAllowance: "500 page scans / month",
    ctaHref: "/login",
    ctaLabel: "Get started",
    ctaType: "sign_in",
    plan: "pro",
    ctaClassName:
      "w-fit rounded-full border-0 bg-[#0f8bd7] px-5 text-white shadow-[0_10px_22px_rgba(15,139,215,0.24)] hover:bg-[#0b78bf]",
    highlights: [
      "500 included page scans each month",
      "Daily recurring scans available within credits",
      "Show scan history for follow-up review"
    ]
  }
] as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-5">
            <Badge tone="neutral">Simple page-scan pricing</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Pricing based on pages scanned
            </h1>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-4 lg:grid-cols-3">
          {standardPlans.map((plan) => (
            <Card
              key={plan.code}
                className={
                  plan.code === "pro"
                    ? "relative flex h-full flex-col overflow-hidden border-sky-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_24px_56px_rgba(15,139,215,0.14)]"
                    : "relative flex h-full flex-col overflow-hidden border-emerald-100 bg-[linear-gradient(180deg,rgba(248,253,250,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-none"
                }
              >
                <div
                  aria-hidden="true"
                  className={
                    plan.code === "pro"
                      ? "absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,139,215,0.26)_0%,rgba(103,199,240,0.38)_100%)]"
                      : "absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(16,185,129,0.22)_0%,rgba(132,204,22,0.32)_100%)]"
                  }
                />
              <CardContent className="flex h-full flex-col justify-between gap-7 p-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{plan.eyebrow}</h2>
                    </div>
                    {plan.code === "pro" ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-sky-800 ring-1 ring-sky-200">
                        Best value
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-semibold tracking-tight text-slate-950">{plan.price}</span>
                      <span className="pb-1 text-sm text-slate-500">{plan.priceNote}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{plan.scanAllowance}</p>
                  </div>

                  <p className="text-sm leading-6 text-slate-600">{plan.summary}</p>

                  <div className="space-y-2">
                    {plan.highlights.map((item) => (
                      <div key={`${plan.code}-${item}`} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <PendingButtonLink
                  className={plan.ctaClassName}
                  data-analytics-cta-type={plan.ctaType}
                  data-analytics-event="pricing_cta_clicked"
                  data-analytics-plan={plan.plan}
                  href={plan.ctaHref}
                  idleContent={
                    <span className="inline-flex items-center gap-2">
                      {plan.ctaLabel}
                      <span aria-hidden="true">›</span>
                    </span>
                  }
                  pendingContent="Opening..."
                  size="sm"
                />
              </CardContent>
            </Card>
          ))}
          <Card className="relative overflow-hidden border-violet-100 bg-[linear-gradient(180deg,rgba(250,248,255,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-none">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(99,91,255,0.22)_0%,rgba(168,85,247,0.3)_100%)]"
            />
            <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
              <div className="space-y-5">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Custom</h2>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Need larger scan volume?</p>
                  <p className="text-sm leading-6 text-slate-600">
                    Contact us for higher page-scan volume, API access, custom evidence retention needs, or portfolio workflows.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-sky-100">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Scan volume</p>
                    <p className="mt-1 font-medium text-slate-900">Custom credits</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-sky-100">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">API access</p>
                    <p className="mt-1 font-medium text-slate-900">Custom access</p>
                  </div>
                </div>
              </div>
              <PendingButtonLink
                className="w-fit rounded-full border-0 bg-slate-950 px-5 text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] hover:bg-slate-800"
                data-analytics-cta-type="contact_sales"
                data-analytics-event="pricing_cta_clicked"
                data-analytics-plan="custom"
                href="/contact-sales?source=pricing&plan=custom"
                idleContent={
                  <span className="inline-flex items-center gap-2">
                    Contact sales
                    <span aria-hidden="true">›</span>
                  </span>
                }
                pendingContent="Opening..."
                size="sm"
              />
            </CardContent>
          </Card>
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-6 text-slate-500">
          Monitoring requests are reviewed before activation. Submitting a request does not automatically activate monitoring.
        </p>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          CertScore.ai surfaces automated public-web observations for review. It does not provide legal advice, certification, or compliance determinations.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
