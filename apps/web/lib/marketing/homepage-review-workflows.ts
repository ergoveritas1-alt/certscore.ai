import type { HomepageLocation } from "./homepage-location";

export const HOMEPAGE_REVIEW_WORKFLOWS = [
  {
    id: "eu", meta: "EU privacy review", title: "GDPR / ePrivacy website review",
    href: "/solutions/gdpr-website-compliance-scanner",
    description: "Help DPOs investigate non-essential cookies, tracking before consent and activity after Reject. Connect observed behavior with privacy disclosures, then coordinate fixes with developers and agencies.",
    topics: ["Pre-consent activity", "Accept & Reject", "Policy disclosures"],
    cta: "Explore GDPR/ePrivacy review"
  },
  {
    id: "us", meta: "US privacy review · California", title: "CCPA / CPRA website review",
    href: "/ccpa",
    description: "Inspect Global Privacy Control (GPC), sale/sharing choices, collection notices and rights disclosures. Give DPOs and US privacy teams concrete evidence to investigate California privacy concerns.",
    topics: ["GPC response", "Sale/sharing choices", "Notices & rights"],
    cta: "Explore CCPA/California review"
  },
  {
    id: "consent", meta: "Consent implementation", title: "Check what happens after a choice",
    href: "/solutions/cookie-consent-scanner",
    description: "Review cookie timing, CMP controls and activity after eligible Accept or Reject clicks. Turn consent concerns into a focused configuration review.",
    topics: [], cta: "Explore cookie consent scanning"
  },
  {
    id: "policy", meta: "Privacy disclosures", title: "Connect policy wording to evidence",
    href: "/solutions/privacy-policy-risk-scanner",
    description: "Inspect retained policy passages alongside observed services and collection surfaces. Give reviewers the source text behind the finding.",
    topics: [], cta: "Explore privacy policy scanning"
  }
] as const;

export function homepageReviewWorkflows(location: HomepageLocation) {
  const [eu, us, consent, policy] = HOMEPAGE_REVIEW_WORKFLOWS;
  return location === "US" ? [us, eu, consent, policy] : [eu, us, consent, policy];
}

export function homepageReviewIntro(location: HomepageLocation) {
  return location === "US"
    ? "Start with CCPA/California signals, GPC and opt-out review. Give data protection officers (DPOs) and privacy teams a shared evidence base for US and GDPR/ePrivacy reviews."
    : "Start with GDPR/ePrivacy consent, tracking and disclosure review. Give data protection officers (DPOs) and privacy teams a shared evidence base that also covers CCPA/California signals and GPC.";
}
