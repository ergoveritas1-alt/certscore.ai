import { SiteHeader } from "../../components/layout/site-header";
import { SiteFooter } from "../../components/layout/site-footer";
import { AiVisibilityContent } from "../../components/marketing/ai-visibility-content";
import { createPageMetadata, createPublicArticleSchema, createBreadcrumbSchema } from "../../lib/seo";
const content = {
  "title": "Editorial policy and evidence standards",
  "description": "Read how CertScore.ai publishes and reviews guides, labels observed evidence and illustrative examples, explains limitations, and handles corrections.",
  "intro": "CertScore.ai publishes these guides as the organization that builds the scanner. They explain observable website behavior and how to review it. Organizational authorship is not a claim of independent legal or academic review.",
  "sections": [
    {
      "title": "Authorship and review scope",
      "paragraphs": [
        "Articles attributed to CertScore.ai are product documentation and editorial guidance from CertScore.ai, LLC. We do not attach a named expert or independent reviewer to content unless that person actually performed and approved the stated review.",
        "Product explanations distinguish observed evidence, inferred review signals, unknown coverage, and legal interpretation. Automated observations can contain errors and do not certify compliance."
      ]
    },
    {
      "title": "Sources, examples, and dates",
      "paragraphs": [
        "Guides link primary technical or regulatory sources where they explain external requirements or protocols. Clearly labeled illustrative examples explain a pattern; retained examples link to a specific existing record and state its limitations. Owned fixtures are not customer outcomes.",
        "Published dates are supplied when recorded. Updated dates describe an editorial change, not the time a build was deployed. An old scan retains its original version and date even when the explanatory article is updated."
      ]
    },
    {
      "title": "Benchmark transparency",
      "paragraphs": [
        "Historical aggregate counts are labeled with their source revision and provenance gaps. They are not estimates of the whole web. A reproducible study needs a defined sample, dates, region, scanner version, exclusions, and deduplication method before stronger prevalence claims are appropriate."
      ]
    },
    {
      "title": "Corrections",
      "paragraphs": [
        "Use the contact page to report the page URL, the statement in question, and supporting evidence. Never send raw cookie values, access tokens, or personal data. We correct explanatory content without rewriting historical scan evidence."
      ],
      "sourceLinks": [
        {
          "href": "https://certscore.ai/contact-sales",
          "label": "Contact CertScore.ai"
        },
        {
          "href": "https://certscore.ai/methodology",
          "label": "Scanner methodology"
        }
      ]
    }
  ]
};
const path = "/editorial-policy";
export const metadata = createPageMetadata({ ...content, path });
export default function EvidencePage() {
 return <main className="min-h-screen bg-slate-50"><SiteHeader />
   <AiVisibilityContent {...content} path={path} badge="Evidence standards" showEvidenceExamples={false}
     schema={[createPublicArticleSchema({ ...content, path }), createBreadcrumbSchema([{ name: "Home", path: "/" }, { name: content.title, path }])]}
     relatedLinks={[{ href: "/methodology", label: "Methodology" }, { href: "/guides", label: "Practical guides" }, { href: "/guides/consent-report-example", label: "Annotated report" }]} />
   <SiteFooter /></main>;
}
