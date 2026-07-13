import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { CERTSCORE_CHROME_EXTENSION_STORE_URL } from "../../lib/browser-extension";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "CertScore.ai Browser Evidence for Chrome",
  description:
    "Install the public CertScore.ai Browser Evidence extension and run reviewer-started, pre-consent website scans from Chrome.",
  path: "/browser-extension"
});

const steps = [
  {
    title: "Add it to Chrome",
    description: "Install CertScore.ai Browser Evidence from its official public Chrome Web Store listing."
  },
  {
    title: "Open the website",
    description: "Visit the public page you want to review, then open the CertScore.ai shield from Chrome’s toolbar."
  },
  {
    title: "Start the scan",
    description: "Run the browser pre-consent scan and open the resulting CertScore.ai report when evidence capture finishes."
  }
] as const;

export default function BrowserExtensionPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_34%),linear-gradient(145deg,#f8fafc_0%,#ffffff_58%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-20">
          <div className="space-y-5">
            <Badge tone="neutral">Chrome extension</Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Capture browser evidence from the Chrome session you choose.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              CertScore.ai Browser Evidence runs only when you start a scan. It observes bounded pre-consent website signals and sends the retained evidence to a CertScore.ai report.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                href={CERTSCORE_CHROME_EXTENSION_STORE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Add to Chrome
              </a>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                href="/browser-extension/privacy"
              >
                Review extension privacy
              </Link>
            </div>
            <p className="text-sm text-slate-500">Public Chrome Web Store release · Version 0.2.0</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)] sm:p-8">
            <div className="flex items-center gap-4">
              <Image alt="" className="h-14 w-14 rounded-2xl border border-slate-700 bg-white" height={56} src="/certscore-mark-dark.png" width={56} />
              <div>
                <p className="text-lg font-semibold">CertScore.ai Browser Evidence</p>
                <p className="mt-1 text-sm text-slate-400">Reviewer-started Chrome scan</p>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
              <p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">Fresh pre-consent observation from the selected tab</p>
              <p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">Bounded request, cookie, consent-interface, and policy-surface evidence</p>
              <p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">No passwords, form entries, payment information, or cookie values captured</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-700">How it works</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Install once, then start scans from Chrome.</h2>
        </div>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sm font-bold text-sky-800">{index + 1}</span>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
      <SiteFooter />
    </main>
  );
}
