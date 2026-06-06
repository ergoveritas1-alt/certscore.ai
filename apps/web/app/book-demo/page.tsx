import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

const BOOK_DEMO_URL = "https://calendly.com/bmasek-w7ou/30min";

export const metadata: Metadata = createPageMetadata({
  title: "Book a Demo",
  description: "Request a CertScore.ai demo and website review for privacy, consent, vendor, cookie, and accessibility signal workflows.",
  path: "/book-demo"
});

export default function BookDemoPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Book a demo</p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Request a website review with CertScore.ai.
            </h1>
            <Button
              asChild
              className="border-0 bg-[linear-gradient(135deg,#2563eb_0%,#0f8bd7_100%)] text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] hover:brightness-[1.05] focus-visible:ring-sky-500"
            >
              <Link data-analytics-event="hero_book_demo_clicked" href={BOOK_DEMO_URL}>
                Schedule demo
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
