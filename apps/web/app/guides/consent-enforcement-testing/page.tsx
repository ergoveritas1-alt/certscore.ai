import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { buildArticleSchema, type AiGuideContent } from "../ai-guide-content";

const guide: AiGuideContent = {
  badge: "Consent testing guide",
  title: "Consent enforcement testing: what happens after Accept and Reject",
  description: "Learn how separate browser sessions, confirmed choice transitions, temporal anchoring, and explicit coverage make Accept and Reject Path observations reviewable.",
  path: "/guides/consent-enforcement-testing",
  intro: "A consent platform can report the choice it recorded. Consent enforcement testing asks a different question: what did the browser do after that choice was independently confirmed? CertScore compares a pre-choice baseline with separate Accept and Reject observations on eligible public sites.",
  sections: [
    {
      title: "Separate sessions prevent choice contamination",
      paragraphs: [
        "Accept and Reject each run in a fresh browser session. That prevents an earlier choice, cookie, or storage value from influencing the other path and preserves a comparable pre-choice baseline.",
        "The Accept Path is a score-neutral comparison baseline. Ordinary analytics or advertising activity after acceptance is expected; it helps identify which activity is genuinely consent-dependent and does not create a negative finding on its own."
      ]
    },
    {
      title: "A Reject result starts with confirmation",
      paragraphs: [
        "A click or disappearing banner is not enough. CertScore requires an independently verified refusal-state transition before post-refusal activity can qualify. Requests already in flight at that moment are excluded so queued activity is not mislabeled as a response to the refusal.",
        "A projected Reject Path finding requires classified non-essential activity anchored after confirmation, such as an eligible request, a cookie or storage write, or a retained consent-state contradiction. An unchanged stored value by itself remains a factual review signal, not proof of active use."
      ]
    },
    {
      title: "Clean and limited are different outcomes",
      paragraphs: [
        "A confirmed-clean result means no qualifying activity was retained during one completed observation window. It is bounded to that region, session, and point in time; it is not proof that the site always honors refusal.",
        "If CertScore cannot identify a control safely, confirm the choice, complete the observation, or verify the evidence, the result stays limited or unknown. Limited coverage is score-neutral and never a pass."
      ]
    },
    {
      title: "Regulatory relevance without a legal conclusion",
      paragraphs: [
        "These observations can support GDPR/ePrivacy review of pre-choice activity, practical consent choices, and whether a confirmed refusal is reflected in runtime behavior. They do not decide consent validity, legal basis, necessity, exemption, or compliance.",
        "If retained interface and policy evidence shows that the same mechanism manages advertising or sale/sharing preferences, the evidence may also be relevant to California privacy-choice review. An ordinary cookie-banner Reject is not automatically a CCPA/CPRA opt-out."
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
