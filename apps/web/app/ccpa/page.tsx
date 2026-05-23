import type { Metadata } from "next";
import { RegulatoryPage } from "../../components/marketing/regulatory-page";
import { absoluteUrl, createPageMetadata } from "../../lib/seo";

const pageTitle = "CCPA Website Privacy Scanner | Opt-Out, Cookies & Disclosure Signals | CertScore.ai";
const pageDescription =
  "Evidence-based CCPA/CPRA review signals for public websites. Review opt-out and disclosure surfaces, cookie and tracking behavior, sensitive-data indicators, and policy/runtime gaps. Automated observations for review, not legal advice.";
const pagePath = "/ccpa";
const disclaimer =
  "CertScore findings are automated public-web observations for review, not legal advice, certification, or a compliance determination.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: pageTitle,
    description: pageDescription,
    path: pagePath
  }),
  title: {
    absolute: pageTitle
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: absoluteUrl(pagePath),
    siteName: "CertScore.ai",
    type: "website",
    images: [
      {
        url: absoluteUrl("/certscore-header-logo.png"),
        width: 512,
        height: 512,
        alt: "CertScore.ai"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: [absoluteUrl("/certscore-header-logo.png")]
  }
};

export default function CcpaPage() {
  return (
    <RegulatoryPage
      config={{
        badge: "CCPA privacy scanner",
        description: pageDescription,
        disclaimer,
        evidenceRows: [
          ["domain", "www.kbdlab.io"],
          ["scan_id", "31d3fd46-3583-4011-88eb-63ac3643e0b0"],
          ["scanned_at", "2026-03-15T08:58:57.721Z"],
          ["finding_id", "policy_clarity_risk"],
          ["regulatory_lane", "CCPA/CPRA"],
          ["confidence", "strong"],
          ["directness", "direct"],
          ["policy_signal", "CCPA Privacy Rights (Do Not Sell My Personal Information)"],
          ["consent_summary", "preconsent_tracking_detected=false; banner_present=false"],
          ["finding_label", "Disclosure clarity remains weak"]
        ],
        evidenceTitle: "Policy evidence card",
        faqs: [
          {
            question: "What is a CCPA website privacy scanner?",
            answer:
              "A CCPA website privacy scanner reviews public website behavior and disclosure surfaces that may be relevant to California privacy review. CertScore focuses on observable signals such as privacy links, cookie and tracker behavior, opt-out surfaces, sensitive-data indicators, and policy/runtime alignment."
          },
          {
            question: "Can CertScore tell me if a website complies with the CCPA?",
            answer:
              "No. CertScore provides automated public-web observations for review. It does not provide legal advice, certification, proof of non-compliance, or a CCPA compliance determination."
          },
          {
            question: "What CCPA/CPRA topics can public scanning help prioritize?",
            answer:
              "Public scanning can help prioritize review of privacy-policy availability, cookie and tracker behavior, opt-out link visibility, sensitive-data context signals, third-party disclosures, and gaps between stated disclosures and observed behavior."
          },
          {
            question: "Does CertScore process consumer privacy requests?",
            answer:
              "No. CertScore can help teams review public request and disclosure surfaces, but privacy-request intake, verification, fulfillment, and legal analysis remain with the site operator and its advisors."
          },
          {
            question: "What does not detected mean on a CCPA-related signal?",
            answer:
              "Not detected means the signal was not observed in the scan scope. It is not proof of absence, and results can vary by region, page coverage, A/B tests, prior browser state, CMP configuration, blocked scans, and timing."
          }
        ],
        heroChips: ["Public-web evidence", "Opt-out + disclosure review", "Cookie and tracker signals"],
        path: pagePath,
        primaryCtaLocation: "ccpa_hero",
        reviewContexts: [
          {
            title: "California privacy rights and disclosures",
            body:
              "CCPA/CPRA review often starts with whether public privacy disclosures, request channels, and consumer-choice surfaces are visible and aligned with actual site behavior.",
            links: [
              { href: "https://privacy.ca.gov/california-privacy-rights/rights-under-the-california-consumer-privacy-act/", label: "California privacy rights" },
              { href: "https://oag.ca.gov/privacy/ccpa", label: "California DOJ CCPA overview" }
            ]
          },
          {
            title: "CCPA regulations and agency updates",
            body:
              "Regulatory materials can help reviewers understand current California privacy expectations, including recent CPPA rulemaking and effective-date context.",
            links: [
              { href: "https://cppa.ca.gov/regulations/", label: "CPPA law and regulations" },
              { href: "https://cppa.ca.gov/regulations/ccpa_updates.html", label: "CPPA CCPA updates" }
            ]
          },
          {
            title: "Sale, sharing, and targeted advertising review",
            body:
              "Cookie, tracker, cross-domain identifier, and adtech signals may help teams decide whether sale/share opt-out, disclosure, and vendor-governance review should move higher in the queue.",
            links: []
          },
          {
            title: "Sensitive personal information context",
            body:
              "Public pages that combine sensitive-page context, forms, or third-party tracking deserve careful manual review before drawing conclusions from automated evidence.",
            links: []
          }
        ],
        schemaAbout: ["CCPA", "CPRA", "California privacy", "privacy disclosures", "opt-out review", "website scanning"],
        signalCards: [
          {
            title: "Privacy and opt-out surfaces",
            body:
              "CertScore can surface whether privacy-policy, privacy-request, and opt-out-oriented links appear from public navigation, footer, and scanned page structure."
          },
          {
            title: "Cookie and tracker behavior",
            body:
              "Runtime evidence shows third-party requests, cookies, storage, and vendor signals that may be useful when reviewing disclosure, sale/share, and targeted-advertising questions."
          },
          {
            title: "Policy/runtime gaps",
            body:
              "Observed behavior is compared with public policy-topic signals so reviewers can find places where disclosures may not match the visible public website."
          }
        ],
        steps: [
          "Load public pages in a clean browser profile.",
          "Record privacy, cookie, tracker, storage, request, and visible disclosure signals.",
          "Classify signals by review topic where evidence is strong enough.",
          "Surface retained observations for privacy, product, legal, engineering, or vendor-owner review."
        ],
        summary:
          "CertScore scans public websites for CCPA/CPRA-relevant privacy review signals, including privacy and opt-out surfaces, third-party tracking behavior, cookie and storage activity, sensitive-page context, and gaps between observed runtime behavior and public disclosures.",
        title: "CCPA website privacy signals from public browser evidence"
      }}
    />
  );
}
