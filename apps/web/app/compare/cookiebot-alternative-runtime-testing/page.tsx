import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Comparison",
  description:
    "See where Cookiebot's consent banner and cookie declaration help, and how CertScore.ai adds evidence from a particular browser visit.",
  intro:
    "Cookiebot helps present consent choices and publish a cookie declaration. CertScore.ai records what cookies and requests appeared in a particular public browser visit, including their timing around a choice when evidence is available.",
  path: "/compare/cookiebot-alternative-runtime-testing",
  relatedLinks: [
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime scanner" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/third-party-cookie-checker", label: "Third-party cookie checker" },
    { href: "/guides/detect-tracking-before-consent", label: "Pre-consent tracking detection" },
    { href: "/guides/consent-report-example", label: "Annotated retained report" }
  ],
  sections: [
    {
      title: "What each tool answers",
      paragraphs: [
        "Cookiebot provides a consent banner, cookie scanning, and a declaration that can list each cookie's name, provider, purpose, and expiration. Those are useful for informing visitors and managing choices.",
        "CertScore.ai answers a narrower measurement question: which cookies, storage entries, and third-party requests appeared during this visit, and when relative to the recorded consent state? It does not operate the consent banner."
      ],
      sourceLinks: [{ href: "https://www.cookiebot.com/en/cookie-scripts/", label: "Cookiebot's cookie scripts and declaration" }]
    },
    {
      title: "A practical declaration check",
      paragraphs: [
        "If a team updates a tag manager or adds an embed, open a fresh scan from the relevant region. Compare the retained pre-choice cookie names and request destinations with the site's current Cookiebot declaration and configured categories.",
        "A difference is a question for the site owner to investigate. One automated visit cannot prove that a declaration is complete or that a legal requirement was breached."
      ]
    },
    {
      title: "Read the action evidence separately",
      paragraphs: [
        "On eligible scans, Accept and Reject use separate sessions. A completed click, confirmed choice, and after-choice activity are distinct facts. Accept is an ordinary score-neutral comparison; limited coverage is not a clean result.",
        "For a confirmed refusal, inspect any qualifying later requests alongside timing and attribution limits. Separately verified tracking after a completed Reject click can be a review signal even when registration was not confirmed."
      ]
    }
  ],
  title: "Cookiebot consent management and runtime testing",
  type: "Comparison"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function CookiebotAlternativeRuntimeTestingPage() {
  return <GrowthContentPage config={config} />;
}
