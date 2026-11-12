import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Comparison",
  description:
    "Compare consent management platforms with runtime consent scanners that observe browser behavior before and after consent choices.",
  intro:
    "Consent platforms help configure and present choices. Runtime scanning helps verify what actually happens in the browser before and after those choices.",
  path: "/compare/cmp-vs-runtime-consent-scanner",
  relatedLinks: [
    { href: "/guides/consent-enforcement-testing", label: "Consent enforcement testing" },
    { href: "/compare/cookiebot-alternative-runtime-testing", label: "Cookiebot consent management and runtime testing" },
    { href: "/compare/onetrust-runtime-consent-testing", label: "OneTrust runtime testing" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "A CMP manages consent choices, preferences, categories, and banner presentation. A runtime consent scanner observes browser behavior and can surface whether tracking or cookies appear before or after those choices.",
        "The two tools are complementary. CertScore.ai does not replace a CMP; it helps teams review observable behavior around the CMP."
      ]
    },
    {
      title: "Where a CMP helps",
      paragraphs: [
        "CMPs help configure notices, consent categories, regional rules, preference centers, and consent signals for downstream tags.",
        "They are the operational control plane for collecting and storing choices."
      ]
    },
    {
      title: "Where runtime scanning helps",
      paragraphs: [
        "On eligible scans, CertScore.ai uses separate fresh browser sessions for baseline, Accept, and Reject. It acts only on an authorized, uniquely identified first-layer control; the completed click and any confirmed consent-state transition are reported separately.",
        "Compare cookies, service requests and timing across the retained observation windows. After a completed eligible Reject action, retained non-essential cookies and services can support GDPR/ePrivacy review. California collection review uses separate request, purpose and choice-scope evidence. Presence alone does not prove active use or a legal violation.",
        "DPOs, agencies and developers can use this evidence to investigate CMP settings and tag configuration, assign a fix and retest."
      ]
    }
  ],
  title: "CMP vs runtime consent scanner",
  type: "Comparison"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function CmpVsRuntimeConsentScannerPage() {
  return <GrowthContentPage config={config} />;
}
