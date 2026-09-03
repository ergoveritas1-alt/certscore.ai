import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { buildArticleSchema, type AiGuideContent } from "../ai-guide-content";

const guide: AiGuideContent = {
  badge: "Consent testing guide",
  title: "Consent enforcement testing: what happens after Accept and Reject",
  description: "Learn how separate browser sessions, confirmed choice transitions, temporal anchoring, and explicit coverage make Accept and Reject Path observations reviewable.",
  path: "/guides/consent-enforcement-testing",
  intro: "A consent platform can report the choice it recorded. Consent enforcement testing asks a different question: what did the browser do after that choice was independently confirmed? CertScore.ai compares a pre-choice baseline with separate Accept and Reject observations on eligible public sites.",
  sections: [
    {
      title: "What is Accept and Reject Path testing?",
      paragraphs: [
        "Accept and Reject Path testing observes what a website does after a visitor’s consent choice. On eligible sites, CertScore.ai performs one authorized, deterministic first-layer Accept or Reject in separate clean browser sessions, then compares the cookies, storage, trackers, and network activity that follow against the pre-choice baseline. A Reject result requires a confirmed refusal-state transition before any activity counts, and activity already in flight at that moment is excluded."
      ]
    },
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
        "A click or disappearing banner is not enough. CertScore.ai requires an independently verified refusal-state transition before post-refusal activity can qualify. Requests already in flight at that moment are excluded so queued activity is not mislabeled as a response to the refusal.",
        "A projected Reject Path finding requires classified non-essential activity anchored after confirmation, such as an eligible request, a cookie or storage write, or a retained consent-state contradiction. An unchanged stored value by itself remains a factual review signal, not proof of active use."
      ]
    },
    {
      title: "Clean and limited are different outcomes",
      paragraphs: [
        "A confirmed-clean result means no qualifying activity was retained during one completed observation window. It is bounded to that region, session, and point in time; it is not proof that the site always honors refusal.",
        "If CertScore.ai cannot identify a control safely, confirm the choice, complete the observation, or verify the evidence, the result stays limited or unknown. Limited coverage is score-neutral and never a pass."
      ]
    },
    {
      title: "Why this matters for privacy review",
      paragraphs: [
        "A cookie banner’s appearance does not establish what a website actually does after someone makes a choice. On eligible sites, CertScore.ai tests the resulting browser behavior—cookies, storage, trackers, and relevant network activity—after a confirmed Accept and after a confirmed Reject.",
        "For GDPR and ePrivacy review, this evidence can help teams investigate whether consent-dependent activity reflects the visitor’s choice and whether non-essential storage or access continues after a confirmed refusal. The ePrivacy Directive specifically addresses storing information on, or gaining access to information stored in, a user’s terminal equipment, subject to limited exceptions; GDPR requirements govern consent and its withdrawal. The two ask different questions of the same evidence.",
        "For CCPA and CPRA review, the evidence may be relevant where the tested control governs the sale or sharing of personal information, including sharing for cross-context behavioral advertising. An ordinary cookie-banner Reject action is not automatically a statutory CCPA/CPRA opt-out, so CertScore.ai reports the observed behavior without making that legal conclusion. This relevance depends on the specific mechanism observed, not on the presence of a Reject control.",
        "Where a choice cannot be confirmed, the report records limited coverage rather than a result."
      ],
      sourceLinks: [
        { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679", label: "GDPR (Regulation 2016/679)" },
        { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20091219", label: "Consolidated ePrivacy Directive" },
        { href: "https://oag.ca.gov/privacy/ccpa", label: "California Attorney General CCPA guidance" }
      ]
    },
    {
      title: "Does Accept and Reject Path testing determine GDPR or CCPA compliance?",
      paragraphs: [
        "No. CertScore.ai records evidence about website behavior; it does not make a legal compliance determination. The observations can support GDPR, ePrivacy and—where the tested control governs sale or sharing—California privacy-choice review. Applying them to a specific site is a judgment for the reviewer, not an output of the scan."
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
