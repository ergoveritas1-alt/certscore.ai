import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Terms of Service",
  description:
    "Read the CertScore.ai Terms of Service, including scan authorization, no legal advice language, acceptable use, and service limitations.",
  path: "/terms"
});

const sections = [
  {
    title: "1. Introduction",
    body:
      "These Terms of Service govern your use of CertScore.ai. By using the service, you agree to these terms and to use CertScore.ai only for lawful, authorized purposes."
  },
  {
    title: "2. Use of the Service",
    body:
      "CertScore.ai provides automated website scanning for observable accessibility, privacy, and disclosure-related signals. The service is intended for informational and operational use."
  },
  {
    title: "3. Authorization to Scan Websites",
    body:
      "By submitting a domain to CertScore.ai, you represent that you have authorization to analyze that website. You are responsible for ensuring that your use of the service is permitted."
  },
  {
    title: "4. No Legal Advice Disclaimer",
    body:
      "CertScore.ai provides automated website scanning only. CertScore.ai does not provide legal advice or legal opinions."
  },
  {
    title: "5. No Guarantee of Compliance",
    body:
      "Scan results are informational and should not be relied upon as confirmation of legal compliance. Automated scans can identify observed issues and patterns, but they do not guarantee legal sufficiency."
  },
  {
    title: "6. Acceptable Use",
    body:
      "You may not use CertScore.ai to analyze websites you are not authorized to review, interfere with service operations, attempt unauthorized access, or use the service for unlawful activity."
  },
  {
    title: "7. Limitation of Liability",
    body:
      "CertScore.ai is provided on an as-is basis. To the maximum extent permitted by law, CertScore.ai and its operators are not liable for indirect, incidental, special, consequential, or business-interruption damages arising from use of the service."
  },
  {
    title: "8. Termination",
    body:
      "We may suspend or terminate access if the service is used in violation of these terms or in ways that create risk for the platform, other users, or third parties."
  },
  {
    title: "9. Governing Law",
    body:
      "These terms are governed by the laws of the applicable operating jurisdiction of CertScore.ai, without regard to conflict-of-law principles."
  },
  {
    title: "10. Contact Information",
    body:
      "If you have questions about these terms, contact CertScore.ai through the contact information or support channel listed on certscore.ai."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="warning">Automated scanning only. Not legal advice.</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Terms of Service</h1>
          <p className="text-lg text-slate-600">
            These terms explain how CertScore.ai may be used and set expectations around scan
            authorization, service limitations, and acceptable use.
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
