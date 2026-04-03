import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description: "Operator contact details for ConsentCheck crawler questions, rate-limit issues, or verification requests.",
  path: "/contact"
});

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Operator contact</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Contact ConsentCheck</h1>
            <p className="text-lg text-slate-600">
              Use this path for crawler identification questions, rate-limit concerns, verification requests, or other operator-facing inquiries.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            <p>
              Use this page as the operator-facing contact path for crawler questions, verification issues, or rate-limit concerns.
            </p>
            <p className="mt-3">
              Crawler info: <Link className="font-medium text-sky-700" href="/crawler">/crawler</Link>
            </p>
            <p className="mt-3">
              Scanning policy: <Link className="font-medium text-sky-700" href="/scanning-policy">/scanning-policy</Link>
            </p>
            <p className="mt-3">
              General inquiry form: <Link className="font-medium text-sky-700" href="/contact-sales">/contact-sales</Link>
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
