import type { Metadata } from "next";
import { getCrawlerPublicUrl, getCrawlerUserAgent } from "@website-signal-risk-scanner/shared";
import { getDefaultSignatureAgentUrl } from "@website-signal-risk-scanner/web-bot-auth";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Crawler",
  description: "Public crawler identity, user-agent, contact, and Cloudflare Verified Bot readiness details for ConsentCheck.",
  path: "/crawler"
});

export default function CrawlerPage() {
  const crawlerPublicUrl = getCrawlerPublicUrl();
  const userAgent = getCrawlerUserAgent();
  const signatureAgentUrl = getDefaultSignatureAgentUrl({ crawlerPublicUrl });
  const contactUrl = new URL("/contact", crawlerPublicUrl).toString();

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Public crawler identity</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">ConsentCheck crawler details</h1>
            <p className="max-w-3xl text-lg text-slate-600">
              ConsentCheck operates a public-web-focused crawler for transparency and website compliance posture review. It is rate-limited, non-aggressive, and not intended to bypass access controls or protections.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-lg font-semibold text-slate-950">Purpose and scope</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
                <li>Assess public websites for observable consent, privacy, and disclosure posture.</li>
                <li>Verify compliance posture for websites across public-web rule families such as GDPR, CCPA/CPRA, CFTC, and SEC.</li>
                <li>Operate with a stable public identity rather than stealth behavior, UA spoofing, or evasive techniques.</li>
              </ul>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-lg font-semibold text-slate-950">Crawler identity</h2>
              <dl className="mt-4 space-y-3 text-sm text-slate-600">
                <div>
                  <dt className="font-medium text-slate-900">Stable user-agent</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-slate-700">{userAgent}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Public info URL</dt>
                  <dd className="mt-1 break-all text-sky-700">{crawlerPublicUrl}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Contact path</dt>
                  <dd className="mt-1 text-sky-700">{contactUrl}</dd>
                </div>
              </dl>
            </article>
          </div>

          <article className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-950">Cloudflare Verified Bot readiness</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
              <li>Request Signature / Web Bot Auth supported.</li>
              <li>Public key directory URL: {signatureAgentUrl}</li>
              <li>Stable user-agent string: {userAgent}</li>
              <li>Operator contact path: {contactUrl}</li>
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              ConsentCheck signs its public key directory and can sign outbound HTTP crawler requests with Cloudflare Web Bot Auth headers when enabled in production configuration.
            </p>
          </article>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
