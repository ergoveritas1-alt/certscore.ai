import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";

export const metadata: Metadata = {
  title: "Chrome extension privacy | CertScore.ai",
  description: "How the CertScore.ai Chrome extension handles browser-observed scan evidence."
};

export default function BrowserExtensionPrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <article className="mx-auto max-w-3xl space-y-8 px-6 py-16">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Chrome extension privacy</p>
          <h1 className="text-4xl font-semibold tracking-tight">Browser evidence is collected only when you start a scan</h1>
          <p className="text-base leading-7 text-slate-600">The CertScore.ai extension performs a user-initiated, time-bounded review of the website open in the selected Chrome tab.</p>
        </div>
        <section className="space-y-3"><h2 className="text-2xl font-semibold">Evidence collected</h2><p className="leading-7 text-slate-700">The extension may collect the target URL and hostname, bounded network request and response metadata, cookie names and attributes, visible consent-interface evidence, browser-observed fingerprinting signals, scan timing, and a screenshot of the visible tab.</p></section>
        <section className="space-y-3"><h2 className="text-2xl font-semibold">Evidence not collected</h2><p className="leading-7 text-slate-700">The extension does not capture cookie values, passwords, form entries, payment information, or browsing activity outside the reviewer-started scan window.</p></section>
        <section className="space-y-3"><h2 className="text-2xl font-semibold">Use and sharing</h2><p className="leading-7 text-slate-700">Evidence is transmitted securely to CertScore.ai to create and support the requested scan report. It is not sold or used for personalized advertising. Access is limited to providing the scan, support, security, and legally required operations.</p></section>
        <section className="space-y-3"><h2 className="text-2xl font-semibold">Chrome Web Store Limited Use</h2><p className="leading-7 text-slate-700">CertScore.ai&apos;s use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements.</p></section>
        <section className="space-y-3"><h2 className="text-2xl font-semibold">Control and deletion</h2><p className="leading-7 text-slate-700">Scans run only after you select the scan button. You can remove the extension at any time. For questions or deletion requests, use the contact details in the CertScore.ai privacy policy.</p><Link className="font-semibold text-sky-700 underline underline-offset-4" href="/privacy">Read the CertScore.ai privacy policy</Link></section>
      </article>
      <SiteFooter />
    </main>
  );
}
