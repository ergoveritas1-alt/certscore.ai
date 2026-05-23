import type { Metadata } from "next";
import { RegulatoryPage } from "../../components/marketing/regulatory-page";
import { absoluteUrl, createPageMetadata } from "../../lib/seo";

const pageTitle = "FTC Website Disclosure Scanner | Reviews, Claims & Dark Pattern Signals | CertScore.ai";
const pageDescription =
  "Evidence-based FTC review signals for public websites. Review disclosure visibility, endorsement and review surfaces, subscription-friction signals, privacy claims, tracking behavior, and policy/runtime gaps. Automated observations for review, not legal advice.";
const pagePath = "/ftc";
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

export default function FtcPage() {
  return (
    <RegulatoryPage
      config={{
        badge: "FTC disclosure scanner",
        description: pageDescription,
        disclaimer,
        evidenceRows: [
          ["domain", "www.betterment.com"],
          ["scan_id", "da63668a-1474-4d13-ac60-fbb87e38b32b"],
          ["scanned_at", "2026-04-01T01:25:25.753Z"],
          ["finding_id", "affiliate_disclosure_scope_limited"],
          ["finding_label", "Affiliate disclosure scope limited"],
          ["confidence", "limited"],
          ["directness", "inferred"],
          ["surface_text", "Special Offer: Welcome to Betterment"],
          ["runtime_context", "preconsent_tracking_detected=true; banner_present=false"],
          ["review_scope", "offer, disclosure, and material-connection review"]
        ],
        evidenceTitle: "Disclosure evidence card",
        faqs: [
          {
            question: "What is an FTC website disclosure scanner?",
            answer:
              "An FTC website disclosure scanner reviews public website surfaces that may be relevant to advertising, endorsement, review, privacy, and consumer-protection review. CertScore surfaces observations for human review; it does not decide whether an ad, claim, disclosure, subscription flow, or review practice is lawful."
          },
          {
            question: "Can CertScore determine whether a website violates FTC rules?",
            answer:
              "No. CertScore provides automated public-web observations for review, not legal advice, certification, proof of violation, or an FTC compliance determination."
          },
          {
            question: "What kinds of FTC-related signals can public scanning help with?",
            answer:
              "Public scanning can help triage visible disclosures, promotional claims, review and testimonial surfaces, affiliate-style wording, subscription or cancellation friction, privacy-policy claims, cookie/tracker behavior, and gaps between stated disclosures and observed behavior."
          },
          {
            question: "Does this replace a manual advertising or legal review?",
            answer:
              "No. Automated evidence can help reviewers find issues faster, but claims, substantiation, material connection disclosures, review practices, and consumer-protection questions require context-specific human review."
          },
          {
            question: "What does not detected mean for an FTC-related signal?",
            answer:
              "Not detected means the signal was not observed in the scan scope. It is not proof of absence, and results can vary by page coverage, geolocation, device, A/B tests, personalization, blocked scans, and timing."
          }
        ],
        heroChips: ["Disclosure review", "Claims + reviews", "Dark-pattern signals", "Not legal advice"],
        path: pagePath,
        primaryCtaLocation: "ftc_hero",
        reviewContexts: [
          {
            title: "Endorsements, influencers, and reviews",
            body:
              "FTC materials are useful context when reviewing testimonial, review, affiliate, influencer, and material-connection disclosure surfaces.",
            links: [
              { href: "https://www.ftc.gov/consumer-protection/endorsements-influencers-reviews", label: "FTC endorsements and reviews" },
              { href: "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides", label: "FTC endorsement guides" }
            ]
          },
          {
            title: "Online advertising disclosures",
            body:
              "Digital advertising review often turns on whether disclosures are visible, proximate, understandable, and consistent with the surrounding claim or offer.",
            links: [
              { href: "https://www.ftc.gov/business-guidance/advertising-marketing/online-advertising-marketing", label: "FTC online advertising guidance" }
            ]
          },
          {
            title: "Dark-pattern and friction review",
            body:
              "Subscription, cancellation, consent, checkout, scarcity, countdown, and forced-choice surfaces can deserve manual review when public-page evidence suggests avoidable consumer friction."
          ,
            links: [
              { href: "https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf", label: "FTC dark patterns report" }
            ]
          },
          {
            title: "Privacy claims and runtime behavior",
            body:
              "Public privacy claims can be compared with runtime tracker, cookie, vendor, form, and disclosure evidence to decide whether privacy-review work should be prioritized.",
            links: []
          }
        ],
        schemaAbout: ["FTC", "advertising disclosures", "endorsements", "reviews", "dark patterns", "privacy claims"],
        signalCards: [
          {
            title: "Disclosure visibility",
            body:
              "CertScore can surface disclosure-oriented links, policy pages, promotional language, and page regions where consumer-facing notices may be missing or difficult to find."
          },
          {
            title: "Reviews, testimonials, and claims",
            body:
              "Public copy and page structure can be reviewed for testimonial, endorsement, affiliate, ranking, comparison, and promotional-claim surfaces that need human context."
          },
          {
            title: "Runtime privacy behavior",
            body:
              "Tracker, cookie, form, and vendor observations can help reviewers compare privacy statements with the behavior visible in a clean browser session."
          }
        ],
        steps: [
          "Load public pages and capture visible copy, links, forms, disclosures, and runtime behavior.",
          "Identify promotional, review, testimonial, affiliate, subscription, privacy, and disclosure-oriented surfaces.",
          "Compare observable claims and disclosures with retained tracker, cookie, form, and vendor evidence.",
          "Route ambiguous or higher-risk observations to marketing, legal, privacy, product, or engineering owners."
        ],
        summary:
          "CertScore scans public websites for FTC-relevant review signals, including visible disclosures, advertising and claim surfaces, reviews and testimonials, subscription-friction indicators, privacy-policy claims, and gaps between public statements and observed runtime behavior.",
        title: "FTC website disclosure signals from public page evidence"
      }}
    />
  );
}
