import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Read the CertScore.ai Privacy Policy, including information collection, processing purposes, service providers, transfers, cookies, and retention.",
  path: "/privacy"
});

const sections = [
  {
    title: "1. Overview",
    body: [
      "This Privacy Policy describes how CertScore.ai collects, uses, stores, and retains information when you use certscore.ai and the CertScore.ai service."
    ]
  },
  {
    title: "2. Account And Submitted Information",
    body: [
      "We may collect information you provide directly, such as your email address, name, authentication details, submitted domains, scan settings, selected plan, and account preferences."
    ]
  },
  {
    title: "3. Usage And Operational Data",
    body: [
      "We may collect technical information needed to operate the service, such as authentication events, usage logs, scan status events, browser metadata, and product interaction data."
    ]
  },
  {
    title: "4. Website Scan Data",
    body: [
      "CertScore.ai analyzes publicly accessible website content using automated systems and rule-based checks. We may retain scan metadata, derived signals, counts, booleans, timestamps, evidence URLs, change history, and limited policy or disclosure excerpts when needed to support analysis, review, remediation, and evidence context. We do not describe the service as an archive of full websites or complete policy text bodies."
    ]
  },
  {
    title: "5. Purposes Of Processing Personal Data",
    body: [
      "Processing purposes: CertScore.ai processes personal data and service data for account administration, authentication, scan and report delivery, monitoring, customer support, billing, security, fraud and abuse prevention, product reliability, optional analytics after consent, legal or business recordkeeping, and responding to privacy requests.",
      "CertScore.ai may process account and submitted information to create and manage accounts, authenticate users, provide scans and reports, manage plans, respond to requests, send service messages, and operate customer support.",
      "CertScore.ai may process usage and operational data to run the service, secure accounts, debug errors, monitor scan status, improve product reliability, measure product usage after optional analytics consent, prevent abuse, and maintain business records.",
      "CertScore.ai may process public website scan data to generate evidence-led reports, support remediation review, preserve limited evidence context, compare changes over time, and operate monitoring or validation workflows requested by users."
    ]
  },
  {
    title: "6. Legal Bases For Processing",
    body: [
      "Legal basis / lawful basis disclosure: where applicable, CertScore.ai relies on performance of a contract to provide accounts, scans, reports, plan management, support, billing, and requested service workflows.",
      "CertScore.ai relies on legitimate interests to operate, secure, monitor, debug, improve, protect, and maintain the service, including fraud and abuse prevention, product reliability, limited evidence retention, and business recordkeeping, balanced against user privacy interests.",
      "CertScore.ai relies on consent for optional analytics and session-insight tools when a user allows those tools, and on legal obligation when processing is needed for tax, accounting, dispute, regulatory, or other legally required records."
    ]
  },
  {
    title: "7. Third-Party Service Providers And Recipients",
    body: [
      "CertScore.ai uses third-party infrastructure and service providers that may receive or process information on our behalf. These provider categories include cloud hosting, PostgreSQL-compatible database hosting, S3-compatible object storage, job processing, email delivery, payment and subscription processing, authentication, analytics, security, and operational monitoring.",
      "Current provider examples include AWS for hosting and infrastructure, Stripe for payment and subscription processing, Gmail SMTP where applicable for email delivery, Google Analytics for optional website analytics, and Microsoft Clarity for optional session-insight analysis. Provider use may vary by feature, account state, and operational configuration.",
      "These providers process data to operate, secure, troubleshoot, measure, bill for, or support the CertScore.ai service. CertScore.ai does not describe service-provider access alone as a sale of personal information."
    ]
  },
  {
    title: "8. Payments And Subscription Records",
    body: [
      "Payment card details are handled by Stripe rather than stored directly by CertScore.ai. CertScore.ai may retain Stripe customer identifiers, subscription identifiers, plan status, invoice or checkout status, billing event metadata, and related operational records needed to provide paid plans, support cancellation, reconcile payments, prevent fraud, and maintain business records."
    ]
  },
  {
    title: "9. Cookies, Analytics, And Session-Insight Tools",
    body: [
      "CertScore.ai uses cookies and similar technologies to operate the service, maintain sessions, remember preferences, protect accounts, and understand usage.",
      "Optional analytics and session-insight tools, including Google Analytics and Microsoft Clarity, are intended to run only after analytics consent is allowed. Microsoft Clarity is configured with masking intended to avoid intentionally collecting sensitive form inputs or private report content.",
      "Users can reject optional analytics from the consent surface and can review or change analytics preferences from the Cookie preferences link in the site footer."
    ]
  },
  {
    title: "10. International Transfers",
    body: [
      "CertScore.ai is operated from the United States and uses service providers that may process information in the United States and other countries. Where personal information is transferred across borders, CertScore.ai reviews vendor, contractual, security, and operational safeguards as part of service operation.",
      "Cross-border processing may occur for hosting, storage, payment processing, email delivery, analytics, support, security, and other operational purposes described in this policy."
    ]
  },
  {
    title: "11. Data Retention",
    body: [
      "We retain account data, scan metadata, limited evidence context, and related operational records for as long as needed to operate the service, subject to plan limits, retention settings, legal, security, billing, audit, dispute-resolution, and operational needs."
    ]
  },
  {
    title: "12. Your Privacy Rights",
    body: [
      "Depending on where you live, you may have rights to request access to personal data, deletion, correction, portability, restriction, objection, or certain opt-outs. CertScore.ai provides a public privacy request form at certscore.ai/privacy-request and also accepts requests sent to privacy@certscore.ai."
    ]
  },
  {
    title: "13. Security",
    body: [
      "We use reasonable technical and operational measures to protect account and scan data, but no system can guarantee absolute security."
    ]
  },
  {
    title: "14. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. Material changes will be reflected on this page with updated content."
    ]
  },
  {
    title: "15. Data Protection Officer / Privacy Contact Point",
    body: [
      "Privacy contact point: for privacy-related questions, data-protection questions, or privacy rights requests, contact CertScore.ai at privacy@certscore.ai or use the privacy request form linked from this policy and the site footer.",
      "CertScore.ai does not currently publish a separate named Data Protection Officer. The privacy and data-protection contact point for this service is privacy@certscore.ai."
    ]
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
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-slate-600">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
