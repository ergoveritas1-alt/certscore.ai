import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ContactSalesForm } from "../../components/contact-sales/contact-sales-form";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact Sales",
  description: "Talk with CertScore.ai about website scanning, monitoring needs, pricing, and onboarding.",
  path: "/contact-sales"
});

export default function ContactSalesPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Contact us</h1>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <Card className="relative overflow-hidden border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_100%)]" />
              <CardHeader className="pb-3">
                <p className="text-sm font-semibold text-sky-700">Email support</p>
                <CardTitle className="text-2xl">Send us a message</CardTitle>
                <p className="text-sm leading-6 text-slate-600">Tell us what you’re exploring and we’ll get back to you at your email.</p>
              </CardHeader>
              <CardContent>
                <ContactSalesForm />
              </CardContent>
            </Card>

            <Card className="border border-slate-200 bg-slate-950 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
              <CardHeader className="pb-3">
                <p className="text-sm font-semibold text-sky-300">Prefer a conversation?</p>
                <CardTitle className="text-2xl text-white">Schedule a demo with founder</CardTitle>
                <p className="text-sm leading-6 text-slate-300">See how CertScore.ai can fit your digital privacy review, monitoring, and rollout workflow.</p>
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
