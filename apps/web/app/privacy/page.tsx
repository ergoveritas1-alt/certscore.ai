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
      "This Privacy Policy describes how CertScore.ai collects, uses, and stores information when you use certscore.ai and the CertScore.ai service."
  },
  {
    title: "2. Information You Provide",
    body:
      "We may collect information you provide directly, such as your email address, name, authentication details, submitted domains, and scan settings."
  },
  {
    title: "3. Information Collected Automatically",
    body:
      "We may collect technical information needed to operate the service, such as authentication events, usage logs, scan status events, browser metadata, and product interaction data."
  },
  {
    title: "4. Website Scan Data",
    body:
      "CertScore.ai analyzes publicly accessible website content using automated systems and rule-based checks. We store derived scan signals, counts, booleans, timestamps, usage records, and change events. We do not store raw HTML, screenshots, policy text bodies, or other archival copies of page content."
  },
  {
    title: "5. Third-Party Services",
    body:
      "CertScore.ai uses third-party infrastructure and service providers, including Supabase, Vercel, Redis Cloud, Google Cloud Run Worker Pools, Resend, and Google OAuth where applicable. These providers process data as part of authentication, hosting, job processing, storage, email delivery, and platform operation."
  },
  {
    title: "6. Data Retention",
    body:
      "We retain account data and derived scan metadata for as long as needed to operate the service, subject to plan limits and operational needs."
  },
  {
    title: "7. Cookies and Tracking",
    body:
      "CertScore.ai uses cookies and similar technologies to operate the service, maintain sessions, and understand usage. We may also rely on standard hosting or analytics-related tools needed for service delivery."
  },
  {
    title: "8. Security",
    body:
      "We use reasonable technical and operational measures to protect account and scan data, but no system can guarantee absolute security."
  },
  {
    title: "9. Changes to This Policy",
    body:
      "We may update this Privacy Policy from time to time. Material changes will be reflected on this page with updated content."
  },
  {
    title: "10. Contact",
    body:
      "If you have privacy-related questions, contact CertScore.ai through the contact information or support channel listed on certscore.ai."
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="neutral">Derived signals only</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="text-lg text-slate-600">
            This page explains how CertScore.ai handles account information, public website scan data,
            cookies, and the third-party infrastructure used to operate the service.
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
