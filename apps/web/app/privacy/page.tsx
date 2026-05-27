import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Read the CertScore.ai Privacy Policy, including information collection, scan data handling, third-party infrastructure, cookies, and retention.",
  path: "/privacy"
});

const sections = [
  {
    title: "1. Overview",
    body:
      "This Privacy Policy describes how CertScore.ai collects, uses, stores, and retains information when you use certscore.ai and the CertScore.ai service."
  },
  {
    title: "2. Account And Submitted Information",
    body:
      "We may collect information you provide directly, such as your email address, name, authentication details, submitted domains, scan settings, selected plan, and account preferences."
  },
  {
    title: "3. Usage And Operational Data",
    body:
      "We may collect technical information needed to operate the service, such as authentication events, usage logs, scan status events, browser metadata, and product interaction data."
  },
  {
    title: "4. Website Scan Data",
    body:
      "CertScore.ai analyzes publicly accessible website content using automated systems and rule-based checks. We may retain scan metadata, derived signals, counts, booleans, timestamps, evidence URLs, change history, and limited policy or disclosure excerpts when needed to support analysis, review, remediation, and evidence context. We do not describe the service as an archive of full websites or complete policy text bodies."
  },
  {
    title: "5. Third-Party Services",
    body:
      "CertScore.ai uses third-party infrastructure and service providers, including PostgreSQL-compatible database hosting, S3-compatible object storage, AWS, Stripe for payment and subscription processing, and Gmail SMTP where applicable. These providers process data as part of hosting, job processing, storage, email delivery, payment processing, subscription management, and platform operation."
  },
  {
    title: "6. Payments And Subscription Records",
    body:
      "Payment card details are handled by Stripe rather than stored directly by CertScore.ai. CertScore.ai may retain Stripe customer identifiers, subscription identifiers, plan status, invoice or checkout status, billing event metadata, and related operational records needed to provide paid plans, support cancellation, reconcile payments, prevent fraud, and maintain business records."
  },
  {
    title: "7. Data Retention",
    body:
      "We retain account data, scan metadata, and related operational records for as long as needed to operate the service, subject to plan limits, retention settings, and operational needs."
  },
  {
    title: "8. Your Privacy Rights",
    body:
      "Depending on where you live, you may have rights to request access to personal data, deletion, correction, portability, restriction, objection, or certain opt-outs. CertScore.ai provides a public privacy request form at certscore.ai/privacy-request and also accepts requests sent to privacy@certscore.ai."
  },
  {
    title: "9. Cookies and Tracking",
    body:
      "CertScore.ai uses cookies and similar technologies to operate the service, maintain sessions, and understand usage. We use Google Analytics and Microsoft Clarity for website analytics and session behavior analysis. Microsoft Clarity is configured with strict masking to avoid intentionally collecting sensitive form inputs or private report content."
  },
  {
    title: "10. Security",
    body:
      "We use reasonable technical and operational measures to protect account and scan data, but no system can guarantee absolute security."
  },
  {
    title: "11. Changes to This Policy",
    body:
      "We may update this Privacy Policy from time to time. Material changes will be reflected on this page with updated content."
  },
  {
    title: "12. Contact",
    body:
      "If you have privacy-related questions, email privacy@certscore.ai or use the privacy request form linked from this policy and the site footer."
  }
];

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
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{section.title}</h2>
              <p className="text-sm leading-6 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
