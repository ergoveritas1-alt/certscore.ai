import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Scanning Basics",
  description:
    "Learn the basics of automated public website scanning for privacy, cookies, accessibility, policy, and disclosure review signals.",
  path: "/guides/website-scanning-basics"
});

export default function WebsiteScanningBasicsPage() {
  return (
    <GuideTemplate
      eyebrow="Scanning guide"
      title="Website Scanning Basics"
      intro="Website scanning reviews observable public pages for structured signals such as tracking requests, cookies, consent controls, accessibility issues, policy pages, and disclosure gaps. CertScore.ai uses those observations to produce reviewable findings rather than legal conclusions."
      pagePath="/guides/website-scanning-basics"
      questionTitle="What does an automated website scan review?"
      whyItMatters={[
        "Public websites change constantly as teams add scripts, plugins, landing pages, forms, and policy content.",
        "A repeatable scan gives teams a consistent record of what was observed and what may deserve review.",
        "Structured findings help route work to privacy, marketing, engineering, accessibility, or legal-review owners."
      ]}
      commonIssues={[
        "Teams rely on a one-time launch review even though tag-manager and CMS changes continue after launch.",
        "Cookie, consent, accessibility, and disclosure findings are reviewed separately with no shared evidence trail.",
        "Manual checks miss page templates or vendor behavior that only appears in runtime evidence."
      ]}
      examples={[
        "A scan may observe analytics requests during initial page load, a visible cookie banner, and a privacy policy footer link.",
        "It may also surface accessibility signals such as contrast, labeling, or image-alt issues on public templates.",
        "Policy and disclosure checks can identify missing or thin public explanations that need human review."
      ]}
      automatedScanningHelp={[
        "Automated scanning is strongest when it records evidence consistently and exposes the underlying JSON for review.",
        "It should identify uncertainty, coverage limits, and retained snippets rather than hiding them behind a simple score.",
        "Teams can compare repeated scans to see whether changes improved the observed public behavior."
      ]}
      certScoreHelp={[
        "CertScore.ai combines privacy, cookie, consent, accessibility, policy, and disclosure signals in one public-site scan.",
        "It groups findings by business-readable issue type and includes representative JSON evidence.",
        "The output is designed for operational triage and monitoring, not for certification or legal advice."
      ]}
      certScoreFlagExample="The scan could summarize several findings across tracking, cookies, accessibility, policy, and disclosure review categories."
      relatedGuides={[
        { href: "/guides/website-signal-check", label: "Website signal review checklist" },
        { href: "/guides/privacy-scanner-vs-cookie-scanner", label: "Privacy scanner vs cookie scanner" },
        { href: "/how-it-works", label: "How CertScore.ai works" }
      ]}
    />
  );
}
