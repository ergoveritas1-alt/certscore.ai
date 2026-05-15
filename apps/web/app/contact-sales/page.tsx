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
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Contact us</h1>
            </div>
            <p className="max-w-2xl text-lg text-slate-600">
              Share a website and a bit of context if you want. We can help you evaluate fit, monitoring needs, pricing, and rollout options.
            </p>
          </div>

          <div className="mt-10">
            <Card className="relative overflow-hidden border border-slate-200 bg-white shadow-none">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
              <CardHeader>
                <CardTitle>Start the conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <ContactSalesForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
