import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { AiVisibilityContent } from "../../components/marketing/ai-visibility-content";
import { createPageMetadata, SITE_URL } from "../../lib/seo";
import { CORE_MARKETING_POSITIONING } from "../../lib/marketing/core-positioning";

const title = "What is CertScore.ai?";
const description = "An Evidence-led Website Privacy Scanner for DPOs, agencies and developers reviewing GDPR/ePrivacy and CCPA concerns.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "What is CertScore.ai? | Evidence-led Website Privacy Scanner",
    description,
    path: "/what-is-certscore"
  }),
  title: {
    absolute: "What is CertScore.ai? | Evidence-led Website Privacy Scanner"
  }
};

export default function WhatIsCertScorePage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/what-is-certscore`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Overview"
        showEvidenceExamples={false}
        intro={CORE_MARKETING_POSITIONING}
        schema={schema}
        relatedLinks={[
          { href: "/solutions/gdpr-website-compliance-scanner", label: "GDPR/ePrivacy review" },
          { href: "/ccpa", label: "CCPA/California review" },
          { href: "/how-it-works", label: "Explore the report" },
          { href: "/developers", label: "MCP, API and SDK" },
          { href: "/contact-sales", label: "Agency and DPO workflows" }
        ]}
        sections={[
          {
            title: "See what your websites collect",
            paragraphs: [
              "Scan public pages for cookies, trackers, session-replay signals, privacy disclosures and consent behavior. Open the retained evidence to inspect the service, request, cookie, source passage or control behind a finding.",
              "Compare activity before consent and after eligible Accept or Reject clicks in separate sessions. California review also includes GPC delivery and response, supported opt-out mechanisms, collection notices and rights disclosures."
            ]
          },
          {
            title: "Give DPOs, agencies and developers a shared workflow",
            paragraphs: [
              "DPOs can use dated evidence to investigate GDPR/ePrivacy and CCPA concerns and coordinate a review. Agencies can turn findings into client tasks. Developers can trace tag triggers, CMP settings, vendor requests and disclosure wording, then retest under comparable conditions.",
              "A CMP manages consent choices. CertScore.ai independently observes public website behavior, helping teams investigate whether the implementation matches their intended configuration."
            ]
          },
          {
            title: "Start in the browser or connect an agent",
            paragraphs: [
              "Run a free browser-based scan of one public page, or inspect the sample report first. Public-page scanning requires no site script, SDK installation or code access.",
              "MCP, REST API and TypeScript SDK integrations let supported agents and developer tools start scans and retrieve evidence. Choose the access route that fits the workflow; supported scope and allowances depend on that route."
            ]
          },
          {
            title: "Move from evidence to remediation",
            paragraphs: [
              "Record the page, scan time, region, affected service and evidence reference. Assign the implementation or disclosure review to an owner, make the change and compare a fresh scan.",
              "Use broader page coverage and saved reports where available. For recurring monitoring or agency portfolio workflows, confirm the plan, setup and cadence with CertScore.ai."
            ]
          },
          {
            title: "What automated findings mean",
            paragraphs: [
              "Findings are review signals backed by retained evidence. Check the underlying observations and coverage before deciding what to change. They do not provide legal advice, certification or a compliance determination."
            ]
          }
        ]}
        title={title}
      />
      <SiteFooter />
    </main>
  );
}
