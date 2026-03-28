import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Scanning Policy",
  description: "ConsentCheck scanning policy for public-web crawling, rate limits, scope, and operator expectations.",
  path: "/scanning-policy"
});

export default function ScanningPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Scanning policy</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Public-web crawler policy</h1>
            <p className="max-w-3xl text-lg text-slate-600">
              ConsentCheck focuses on public website surfaces and aims to make its crawler behavior understandable to site operators.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <ul className="list-disc space-y-3 pl-5 text-sm text-slate-600">
              <li>The crawler is intended for public-web review and compliance posture checks, not account-protected or private areas.</li>
              <li>It may verify compliance posture for websites across public-web rule families such as GDPR, CCPA/CPRA, CFTC, and SEC.</li>
              <li>It uses a stable public user-agent and public crawler information page.</li>
              <li>It is rate-limited and intended to avoid aggressive request patterns.</li>
              <li>It is not intended to bypass robots controls, authentication barriers, anti-bot protections, or access restrictions.</li>
              <li>Cloudflare Web Bot Auth support is used to make request provenance more transparent, not to evade detection.</li>
            </ul>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
