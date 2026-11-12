import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ContactSalesForm } from "../../components/contact-sales/contact-sales-form";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";
import { getTurnstileConfig } from "../../server/turnstile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createPageMetadata({
  title: "Website Privacy Reviews for Agencies and DPOs",
  description: "Plan recurring website privacy reviews with CertScore.ai. Discuss GDPR/ePrivacy and CCPA workflows, client portfolios, batch scans, API access and white-label options.",
  path: "/contact-sales"
});

export default function ContactSalesPage() {
  const captchaSiteKey = getTurnstileConfig()?.siteKey;
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold text-sky-700">For web agencies, DPOs and privacy teams</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Build recurring website privacy reviews into your client service.</h1>
            <p className="text-lg leading-8 text-slate-600">Use CertScore.ai to establish a baseline, investigate GDPR/ePrivacy and CCPA concerns, and review evidence after fixes. Give your clients and their DPO a shared record of what their public pages did during each scan.</p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>Turn supported findings into tasks for the CMP, tag manager, vendor integration or privacy notice owner.</li>
              <li>Use an EU origin to review GDPR/ePrivacy consent and disclosure concerns, and California to review CCPA disclosures, GPC and supported opt-out behavior.</li>
              <li>Repeat comparable scans after launches, consent changes and vendor updates.</li>
              <li>Discuss Custom-plan options for client portfolios, white-label reports, batch scans and API access.</li>
            </ul>
            <p className="text-sm leading-6 text-slate-500">Evidence for your team’s review, with clear coverage limits. Automated scans do not certify compliance.</p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <Card className="relative overflow-hidden border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_100%)]" />
              <CardHeader className="pb-3">
                <p className="text-sm font-semibold text-sky-700">Plan your review</p>
                <CardTitle className="text-2xl">Tell us about your websites</CardTitle>
                <p className="text-sm leading-6 text-slate-600">Share your role, site count, target markets and review frequency, plus any API or reporting needs. General product questions are welcome too. We’ll reply by email.</p>
              </CardHeader>
              <CardContent>
                <ContactSalesForm captchaSiteKey={captchaSiteKey} />
              </CardContent>
            </Card>

            <Card className="border border-slate-200 bg-slate-950 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
              <CardHeader className="pb-3">
                <p className="text-sm font-semibold text-sky-300">Prefer a conversation?</p>
                <CardTitle className="text-2xl text-white">Walk through the evidence with our founder</CardTitle>
                <p className="text-sm leading-6 text-slate-300">Explore consent behavior, privacy disclosures and retained evidence, then discuss a workflow for your own site or client portfolio.</p>
              </CardHeader>
              <CardContent>
                <a
                  className="inline-flex w-full items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  href="https://calendly.com/bmasek-w7ou/30min"
                  rel="noreferrer"
                  target="_blank"
                >
                  Choose a time on Calendly
                  <span aria-hidden="true" className="ml-2">↗</span>
                </a>
                <p className="mt-4 text-xs leading-5 text-slate-400">You’ll be taken to Calendly to choose a time that works for you.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
