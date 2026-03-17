import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Disclosure Requirements",
  description:
    "Learn how to think about website disclosure requirements, promotional content signals, and how CertScore.ai surfaces disclosure-related signals on public pages.",
  path: "/guides/website-disclosure-requirements"
});

export default function WebsiteDisclosureRequirementsPage() {
  return (
    <GuideTemplate
      eyebrow="Disclosure guide"
      title="Website Disclosure Requirements"
      intro="Website disclosure requirements are often discussed when a site contains testimonials, reviews, affiliate links, promotional claims, or other endorsement-style content. The practical question is whether the public content appears to disclose important context clearly enough."
      questionTitle="What disclosure requirements should websites think about?"
      whyItMatters={[
        "Promotional content can create risk when the visitor sees a recommendation or endorsement without understanding the relationship behind it.",
        "Disclosure issues are easy to miss because they often live in marketing pages, blog posts, reviews, or footer language rather than formal legal pages.",
        "Teams often need a structured way to spot pages that deserve a closer disclosure review."
      ]}
      commonIssues={[
        "Testimonials or reviews are present without obvious disclosure or contextual language.",
        "Affiliate or sponsored content signals appear on a page, but the disclosure language is weak or absent.",
        "Policy pages exist, but promotional pages still create ambiguity about relationships or incentives."
      ]}
      examples={[
        "A site may promote recommended tools or vendors without making it clear whether compensation is involved.",
        "A testimonial-heavy landing page may emphasize outcomes while omitting context around endorsements or partnerships.",
        "A blog post may use affiliate-style language while the only disclosure lives on a separate page few visitors will read."
      ]}
      automatedScanningHelp={[
        "Automated scanning can look for testimonials, reviews, affiliate terms, sponsored language, and disclosure-like text on public pages.",
        "It can flag endorsement-style content where obvious disclosure wording is not observed.",
        "This kind of analysis is useful for triage because it points teams to the pages most likely to need closer review."
      ]}
      certScoreHelp={[
        "CertScore.ai checks selected public pages for testimonial, review, affiliate, and promotional signals.",
        "It records disclosure-related observations in scan output that can be reviewed alongside other site signals.",
        "That helps teams prioritize which pages or site areas should be checked more carefully."
      ]}
      certScoreFlagExample="The scan could flag testimonial or affiliate-style language on a page where obvious disclosure wording is not detected."
      relatedGuides={[
        { href: "/guides/website-signal-check", label: "Website signal review checklist" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
        { href: "/how-it-works", label: "How CertScore.ai works" }
      ]}
    />
  );
}
