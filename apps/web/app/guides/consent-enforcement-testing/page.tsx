import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { buildArticleSchema, type AiGuideContent } from "../ai-guide-content";

const guide: AiGuideContent = {
  badge: "Consent testing guide",
  title: "Consent enforcement testing: what happens after Accept and Reject",
  description: "Compare website activity before consent and after eligible Accept or Reject clicks. Inspect retained cookies, services and request evidence for GDPR/ePrivacy and CCPA review.",
  path: "/guides/consent-enforcement-testing",
  intro: "Your CMP manages consent choices. CertScore.ai checks observed website behavior. Use separate baseline, Accept and Reject observations to investigate cookies, trackers and services, then give your DPO, agency or developer the evidence needed to review the implementation.",
  sections: [
    {
      title: "Start with independent sessions",
      paragraphs: [
        "Record the public URL, scan origin and time. CertScore.ai observes eligible first-layer Accept and Reject controls in separate fresh sessions so one choice does not contaminate the other.",
        "Review the untouched baseline, completed action and subsequent observations separately. Accept provides a comparison for consent-dependent activity. The report also records available consent-state evidence; a completed click and a registered decision are different facts."
      ]
    },
    {
      title: "Inspect the evidence after Reject",
      paragraphs: [
        "For a completed authorized Reject path, inspect retained non-essential cookies and classified service requests. These observations can support GDPR/ePrivacy review even when semantic consent registration is unconfirmed. Keep the action, cookie snapshot, request timing and source evidence together.",
        "Cookie presence is distinct from a new write, a read or successful collection. Do not treat a script download as proof of data collection. The report keeps those evidence types separate so the implementation owner can investigate the relevant behavior."
      ]
    },
    {
      title: "Use the right regulatory perspective",
      paragraphs: [
        "For GDPR/ePrivacy review, help the DPO investigate non-essential activity before consent and after Reject, review CMP categories and tag triggers, and compare the affected activity with privacy disclosures.",
        "For CCPA/California review, inspect GPC delivery and response, the scope of the tested opt-out control, retained collection evidence, and relevant notices. Cookie rejection, GPC and a sale/sharing opt-out are separate mechanisms. A vendor name alone does not establish the purpose of a request."
      ]
    },
    {
      title: "Keep the conclusion within the observation",
      paragraphs: [
        "Review the capture status and evidence for the particular page, region and session. Unsupported controls, incomplete observations and unverified actions retain their reported status. No activity observed in a bounded window does not establish that tracking never occurs.",
        "A scan supports privacy review; it does not provide legal advice, certification or a compliance determination. Use the retained evidence alongside your organization’s implementation and privacy review."
      ]
    },
    {
      title: "Assign a fix and retest",
      paragraphs: [
        "Share the affected URL, service or cookie, action context, date, region and evidence reference. Review tag-manager triggers, CMP categories, vendor initialization and the corresponding disclosure with the responsible owner.",
        "After a change, run a fresh scan under comparable conditions. Compare the relevant observations and keep the reports with the remediation task. Repeat the review for important templates and regions instead of treating one page as the entire website."
      ]
    }
  ]
};

export const metadata: Metadata = {
  ...createPageMetadata({ title: guide.title, description: guide.description, path: guide.path }),
  title: { absolute: `${guide.title} | CertScore.ai` }
};

export default function ConsentEnforcementTestingGuidePage() {
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/findings/reject_tracking_persists_after_reject", label: "post-refusal tracking finding" },
        { href: "/developers/reference", label: "typed API result contract" },
        { href: "/guides/reject-consent-tracking-test", label: "Reject consent tracking test" },
        { href: "/solutions/cookie-consent-scanner", label: "cookie consent scanner" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}
