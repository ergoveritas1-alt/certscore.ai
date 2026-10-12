import type { Metadata } from "next";
import { ScannerReportExample } from "../../../components/marketing/scanner-report-example";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "Check website cookies by domain, purpose and timing. Follow a real report example, inspect cookies in Chrome, and review activity before consent. Start free.",
  intro:
    "Enter a public page URL to review its cookies, domains, purposes and first-seen timing. Use the report and the checklist below to distinguish first-party cookies from third-party cookies and investigate activity before consent.",
  path: "/guides/third-party-cookie-checker",
  evidence: <ScannerReportExample topic="cookies" />,
  scanPrompt: {
    title: "Check your website’s cookies",
    description: "Start with a free scan of one public page. Open Services & Resources in the report to review cookie domains, purposes, first-seen timing and the related requests."
  },
  relatedLinks: [
    { href: "/guides/check-third-party-cookies-before-consent", label: "Check third-party cookies before consent" },
    { href: "/solutions/cookie-consent-scanner", label: "Cookie consent scanner" },
    { href: "/guides/detect-tracking-before-consent", label: "Pre-consent tracking detection" },
    { href: "/solutions/privacy-policy-risk-scanner", label: "Compare cookies with your privacy policy" },
    { href: "/guides/rtb-cookie-syncing", label: "Investigate cookie syncing" },
    { href: "/methodology", label: "Methodology" }
  ],
  sections: [
    {
      title: "What makes a cookie third-party?",
      paragraphs: [
        "A third-party cookie belongs to a different site from the page in the address bar. Classify it using the site relationship and browser context, rather than the vendor name alone. An analytics vendor can set a first-party cookie on your own domain, as the report example above shows.",
        "Review cookies and network requests together. A request to an external service identifies activity to investigate; the cookie inventory tells you what was actually stored."
      ],
      sourceLinks: [{ href: "https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies", label: "MDN: third-party cookies" }]
    },
    {
      title: "1. Start with a fresh page scan",
      paragraphs: [
        "Use the form above, then confirm the report’s target URL, scan date and region. Open Services & Resources and expand a service to inspect its cookie and request rows. Keep the starting-page observations separate from the report’s After Accept and After Reject sections when those are available.",
        "For each relevant cookie, record its name, domain, purpose, first-seen timing and expiry. Follow its service and evidence details to understand which integration should be reviewed."
      ]
    },
    {
      title: "2. Check the same page in Chrome",
      paragraphs: [
        "Open a fresh browser profile, record its cookie settings, then open DevTools before loading your page. In Application → Storage → Cookies, select each listed origin and inspect the Name, Domain, Path, Expires / Max-Age, SameSite and Partition Key fields. Check the Network panel for the related request and Cookies details.",
        "Record the initial state before making a consent choice. For a manual Accept or Reject comparison, use a separate fresh visit for each choice and record what changes. Keep cookie values out of shared notes; names, domains, timing and the relevant request are usually the useful review details."
      ],
      sourceLinks: [{ href: "https://developer.chrome.com/docs/devtools/application/cookies", label: "Chrome DevTools: inspect cookies" }]
    },
    {
      title: "3. Decide what to investigate",
      paragraphs: [
        "An advertising or analytics cookie appearing before a recorded consent choice is a reason to inspect the tag’s trigger and consent configuration. A login or preference cookie has a different purpose: establish the function before assigning a change.",
        "After Reject, review the recorded action and subsequent requests or writes. A cookie still present in storage is a different observation from a new tracking request or write. Use the report’s corresponding evidence to choose the next action."
      ]
    },
    {
      title: "Why can tracking appear without third-party cookies?",
      paragraphs: [
        "Browser settings can block or partition cross-site cookies while requests to analytics or advertising services still occur. First-party cookies and other storage can also appear in the inventory. Review the service and request evidence alongside the cookie list to understand the captured behavior."
      ]
    },
    {
      title: "4. Fix the integration and retest",
      paragraphs: [
        "Give the implementation owner the affected URL, cookie domain, service, timing and consent state. Review the tag-manager trigger, CMP category and vendor configuration, then repeat the check under matching conditions.",
        "Compare the result with your cookie and privacy-policy disclosures. Keep the before and after reports together so another reviewer can see what changed."
      ]
    }
  ],
  title: "Third-party cookie checker",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function ThirdPartyCookieCheckerPage() {
  return <GrowthContentPage config={config} />;
}
