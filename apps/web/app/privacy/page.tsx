import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";
import { CERTSCORE_PRIVACY_POLICY_SECTIONS } from "./privacy-policy-content";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Read the CertScore.ai Privacy Policy, including information collection, processing purposes, service providers, transfers, cookies, and retention.",
  path: "/privacy"
});

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="neutral">Public scan data, account data, and retained evidence context</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="text-lg text-slate-600">
            This page explains how CertScore.ai handles account information, public website scan data,
            limited evidence context, cookies, and the third-party infrastructure used to operate the service.
          </p>
          <p className="text-sm leading-6 text-slate-600">
            Privacy contact point:{" "}
            <a className="font-medium text-sky-700 hover:text-sky-800" href="mailto:privacy@certscore.ai">
              privacy@certscore.ai
            </a>
            .
          </p>
          <p className="text-sm text-slate-600">
            To exercise privacy rights, use{" "}
            <a className="font-medium text-sky-700 hover:text-sky-800" href="/privacy-request">
              the CertScore.ai privacy request form
            </a>{" "}
            or email{" "}
            <a className="font-medium text-sky-700 hover:text-sky-800" href="mailto:privacy@certscore.ai">
              privacy@certscore.ai
            </a>
            .
          </p>
          <p className="text-sm leading-6 text-slate-600">
            To manage or cancel a paid subscription, sign in and use{" "}
            <a className="font-medium text-sky-700 hover:text-sky-800" href="/app/modify-plan">
              the Modify plan page
            </a>
            . Payment and subscription management is processed through Stripe.
          </p>
        </div>

        <div className="mt-10 space-y-8 rounded-[2rem] border border-slate-200 bg-white p-8">
          {CERTSCORE_PRIVACY_POLICY_SECTIONS.map((section) => (
            <section
              key={section.title}
              id={section.title.includes("Cookies, Analytics") ? "cookies-analytics" : undefined}
              className="scroll-mt-6 space-y-2"
            >
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-slate-600">{paragraph}</p>
              ))}
              {section.link ? (
                <p className="text-sm leading-6">
                  <a
                    className="font-medium text-sky-700 hover:text-sky-800"
                    href={section.link.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {section.link.label}
                  </a>
                </p>
              ) : null}
            </section>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
